import type {FastifyInstance} from 'fastify';
import {randomUUID} from 'node:crypto';
import {query,transaction} from './db.js';
import {requireActor} from './auth.js';
import {requireCurrentActor} from './security.js';
import {respond} from './agent.js';
import {hasSecrets} from './knowledge.js';
import {safeErrorType} from './safe-errors.js';
import {withConversationTurnLock} from './conversation-lock.js';
import {listInvestigationSubjects,readInvestigationState,saveInvestigationState,visibleInvestigationVersions} from './investigation-state.js';
import {routeInvestigation,selectActiveInvestigation,updateInvestigationFromMessage} from './investigation-dialogue.js';
import {recordTurnTelemetry} from './telemetry.js';
import {client} from './llm.js';
import {AgentBudget} from './agent-budget.js';
import {interpretSemanticTurn,applySemanticMemory,type TurnInterpreter,type SemanticTurnResult} from './semantic-turn.js';

const inaccessibleContext=`EXISTS (
  SELECT 1 FROM unnest(m.context_source_version_ids) AS context(version_id)
  WHERE NOT EXISTS (
    SELECT 1 ${visibleInvestigationVersions('$3')} AND v.id=context.version_id
  )
)`;

export function registerChat(app:FastifyInstance,runAgent:typeof respond=respond,interpret:TurnInterpreter=(input,budget)=>interpretSemanticTurn(client,input,budget)) {
 app.post('/conversations',async req=>{
   const actor=await requireActor(req);
   const r=await query('INSERT INTO conversations(user_id) VALUES($1) RETURNING id',[actor.id]);
   return {id:r.rows[0].id};
 });
 app.get('/conversations',async req=>{
   const a=await requireActor(req);
   const r=await query(`SELECT c.id,c.created_at,
    COALESCE(first_question.title,'Nova conversa') AS title,
    recent.updated_at
    FROM conversations c
    JOIN LATERAL (
      SELECT m.created_at AS updated_at FROM messages m
      WHERE m.conversation_id=c.id AND m.auth_revision=$2
      ORDER BY m.created_at DESC,m.id DESC LIMIT 1
    ) recent ON true
    LEFT JOIN LATERAL (
      SELECT left(m.content,90) AS title FROM messages m
      WHERE m.conversation_id=c.id AND m.auth_revision=$2 AND m.role='user'
      ORDER BY m.created_at ASC,m.id ASC LIMIT 1
    ) first_question ON true
    WHERE c.user_id=$1
    ORDER BY recent.updated_at DESC,c.id DESC LIMIT 100`,[a.id,a.auth_revision]);
   return {conversations:r.rows};
 });
 app.get('/conversations/:id',async(req,reply)=>{
   const a=await requireActor(req);const id=(req.params as {id:string}).id;
   const r=await query('SELECT id FROM conversations WHERE id=$1 AND user_id=$2',[id,a.id]);
   if(!r.rowCount) return reply.code(404).send({error:'Conversa não encontrada'});
   const messages=await query(`SELECT m.id,m.role,
       CASE WHEN ${inaccessibleContext} OR COALESCE(jsonb_array_length(live_sources.items),0)<>jsonb_array_length(m.sources)
         THEN 'Esta resposta contém fontes arquivadas ou inacessíveis e não pode mais ser exibida.'
         ELSE m.content END AS content,
       CASE WHEN ${inaccessibleContext} OR COALESCE(jsonb_array_length(live_sources.items),0)<>jsonb_array_length(m.sources)
         THEN '[]'::jsonb ELSE COALESCE(live_sources.items,'[]'::jsonb) END AS sources,
       m.created_at,
       f.rating AS feedback_rating,f.comment AS feedback_comment
     FROM messages m
     -- An archived source can remain in audit storage, but not in historic
     -- citation links. Check the reader's current authorization as well.
     LEFT JOIN LATERAL (
       SELECT jsonb_agg(source.value ORDER BY source.position) AS items
       FROM jsonb_array_elements(m.sources) WITH ORDINALITY AS source(value,position)
       JOIN documents d ON d.id::text=source.value->>'documentId'
       JOIN document_versions v ON v.id::text=source.value->>'versionId' AND v.document_id=d.id
       JOIN spaces s ON s.id=d.space_id
       LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$3
       WHERE d.archived_at IS NULL AND v.status IN ('PUBLISHED','ARCHIVED')
         AND (s.visibility='SHARED' OR COALESCE(g.can_read,false))
     ) live_sources ON true
     LEFT JOIN LATERAL (
       SELECT rating,comment FROM feedback
       WHERE user_id=$3 AND message_id=m.id AND m.role='assistant'
       ORDER BY created_at DESC,id DESC LIMIT 1
     ) f ON true
     WHERE m.conversation_id=$1 AND m.auth_revision=$2
     ORDER BY m.created_at DESC,m.id DESC LIMIT 100`,[id,a.auth_revision,a.id]);
   const pending=await query(`SELECT p.id,p.title,p.content,p.document_id AS "documentId",
       base.content AS "beforeContent",s.name AS "spaceName"
     FROM pending_actions p JOIN spaces s ON s.id=p.space_id
     LEFT JOIN documents target ON target.id=p.document_id
     LEFT JOIN document_versions base ON base.id=p.base_version_id
     LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$2
     WHERE p.conversation_id=$1 AND p.user_id=$2
       AND p.result_version_id IS NULL AND p.expires_at>now()
       AND (p.document_id IS NULL OR target.archived_at IS NULL)
       AND (s.visibility='SHARED' OR COALESCE(g.can_read,false)) AND COALESCE(g.can_edit,false)
     ORDER BY p.expires_at DESC LIMIT 10`,[id,a.id]);
   return {id,messages:messages.rows.reverse(),pendingActions:pending.rows};
 });
 app.delete('/conversations/:id',async(req,reply)=>{
   const actor=await requireActor(req);
   const id=(req.params as {id:string}).id;
   const body=req.body as {confirm?:unknown}|undefined;
   if(body?.confirm!==true)return reply.code(400).send({error:'Confirmação obrigatória'});
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
     return reply.code(404).send({error:'Conversa não encontrada'});
   const deleted=await transaction(async c=>{
     await requireCurrentActor(c,actor);
     const own=await c.query('SELECT id FROM conversations WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,actor.id]);
     if(!own.rowCount)return false;
     // Keep confirmed knowledge/audit; detach it from the conversation before deletion.
     await c.query('UPDATE pending_actions SET conversation_id=NULL '+
       'WHERE conversation_id=$1 AND user_id=$2 AND result_version_id IS NOT NULL',[id,actor.id]);
     await c.query('DELETE FROM pending_actions WHERE conversation_id=$1 AND user_id=$2',[id,actor.id]);
     await c.query('DELETE FROM feedback WHERE message_id IN '+
       '(SELECT id FROM messages WHERE conversation_id=$1)',[id]);
     // ON DELETE CASCADE removes messages; grants and knowledge are untouched.
     await c.query('DELETE FROM conversations WHERE id=$1 AND user_id=$2',[id,actor.id]);
     await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'CONVERSATION_DELETED',$2)",
       [actor.id,id]);
     return true;
   });
   if(!deleted)return reply.code(404).send({error:'Conversa não encontrada'});
   return {ok:true};
 });
 app.post('/conversations/:id/messages',async(req,reply)=>{
   const a=await requireActor(req);const id=(req.params as {id:string}).id;
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return reply.code(404).send({error:'Conversa não encontrada'});
   const b=req.body as {message?:unknown}|undefined;
   if(typeof b?.message!=='string'||b.message.trim().length===0||b.message.length>4000) return reply.code(400).send({error:'Mensagem inválida'});
   const userMessage=b.message;
   if(hasSecrets(userMessage)) return reply.code(422).send({error:'Possível credencial detectada. Remova senhas e tokens antes de enviar.'});

   // Idempotency-Key: optional header for client-controlled deduplication.
   // If provided, must be a valid UUID v4. Returns existing response if key was already processed.
   const idempotencyKey=req.headers['idempotency-key'] as string|undefined;
   if(idempotencyKey!==undefined && (typeof idempotencyKey!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey))){
     return reply.code(400).send({error:'Idempotency-Key deve ser UUID v4'});
   }

   // Acquire before reading the conversation or writing the user message.
   // Competing turns get 409 instead of racing with stale history.
   const turn=await withConversationTurnLock(id,async()=>{
   const conv=await query('SELECT id FROM conversations WHERE id=$1 AND user_id=$2',[id,a.id]);
   if(!conv.rowCount) return reply.code(404).send({error:'Conversa não encontrada'});
   // Only the owner, under the conversation lock and current authorization,
   // may replay an explicitly linked reply. A stale or incomplete key fails closed.
   if(idempotencyKey){
     const cached=await transaction(async c=>{
       await requireCurrentActor(c,a);
       const owned=await c.query('SELECT id FROM conversations WHERE id=$1 AND user_id=$2 FOR SHARE',[id,a.id]);
       if(!owned.rowCount)throw Object.assign(new Error('Conversa não encontrada'),{statusCode:404});
       const existing=await c.query(`SELECT u.content AS question,u.auth_revision AS question_revision,
         m.id,m.content,m.sources,m.auth_revision AS answer_revision,
         (${inaccessibleContext} OR EXISTS (
           SELECT 1 FROM jsonb_array_elements(m.sources) AS source(value)
           WHERE NOT EXISTS (
             SELECT 1 FROM documents d JOIN document_versions v ON v.document_id=d.id
               AND v.id::text=source.value->>'versionId'
             JOIN spaces s ON s.id=d.space_id
             LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$3
             WHERE d.id::text=source.value->>'documentId' AND d.archived_at IS NULL
               AND v.status IN ('PUBLISHED','ARCHIVED')
               AND (s.visibility='SHARED' OR COALESCE(g.can_read,false))
           )
         )) AS inaccessible
         FROM messages u LEFT JOIN messages m ON m.reply_to_message_id=u.id AND m.role='assistant'
         WHERE u.conversation_id=$1 AND u.idempotency_key=$2 AND u.role='user'`,
         [id,idempotencyKey,a.id]);
       return existing.rows[0]??null;
     });
     if(cached){
       if(cached.question_revision!==a.auth_revision||cached.answer_revision!==a.auth_revision||
          cached.question!==userMessage||!cached.id||cached.inaccessible)
         return reply.code(409).send({error:'Esta chave não pode ser reutilizada. Consulte o histórico ou inicie uma nova mensagem.'});
       await recordTurnTelemetry({requestId:req.id,conversationId:id,userId:a.id,
         latencyMs:Date.now()-(req as any).telemetryStart,httpStatus:200,idempotentHit:true});
       return {id:cached.id,answer:cached.content,sources:cached.sources,pendingActions:[],idempotent:true};
     }
   }
   // Retain a bounded older window for derived memory. Never reuse inaccessible
   // cited content or messages from an earlier authorization revision.
   // This is a read-time projection; the original message is retained for audit.
   const previous=await query(`SELECT m.role,m.investigation_id,
      CASE WHEN ${inaccessibleContext} OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(m.sources) AS source(value)
        WHERE NOT EXISTS (
          SELECT 1 FROM documents d
          JOIN document_versions v ON v.document_id=d.id AND v.id::text=source.value->>'versionId'
          JOIN spaces s ON s.id=d.space_id
          LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$3
          WHERE d.id::text=source.value->>'documentId' AND d.archived_at IS NULL
            AND v.status IN ('PUBLISHED','ARCHIVED')
            AND (s.visibility='SHARED' OR COALESCE(g.can_read,false))
        )
      ) THEN 'A resposta anterior usava fontes que não estão mais disponíveis.'
        ELSE m.content END AS content
    FROM messages m
    WHERE m.conversation_id=$1 AND m.auth_revision=$2
    ORDER BY m.created_at DESC,m.id DESC LIMIT 60`,[id,a.auth_revision,a.id]);
   const subjects=await listInvestigationSubjects(a,id);
   const budget=new AgentBudget();
   // Only visible subjects and a bounded recent context are sent to the
   // interpreter. The selected investigation's full state is read afterwards.
   const visibleIds=new Set(subjects.map(s=>s.id));
   const legacyActiveId=selectActiveInvestigation(previous.rows);
   const activeId=previous.rows[0]?.investigation_id&&visibleIds.has(previous.rows[0].investigation_id)?previous.rows[0].investigation_id:null;
   const lastAssistant=previous.rows[0]?.role==='assistant'?previous.rows[0].content:undefined;
   const recentForRouting=previous.rows.slice(0,8).filter((m,index,rows)=>m.investigation_id===activeId&&rows.slice(0,index).every(prior=>prior.investigation_id===activeId)).reverse()
     .map(({role,content})=>({role,content}));
   // A failed unscoped turn must not erase the last visible subject from the
   // routing input. This is only a model hint; selection still requires an
   // accepted decision and an authorized state read.
   const lastKnownId=previous.rows.find(m=>m.investigation_id&&visibleIds.has(m.investigation_id))?.investigation_id??null;
   const interpreted:SemanticTurnResult=await interpret({message:userMessage,subjects,activeId,lastKnownId,history:recentForRouting},budget);
   const semantic=interpreted.status==='accepted'?interpreted.decision:undefined;
   // The legacy classifier is only the local/offline compatibility path.
   // Do not silently choose a subject by regex after a failed model review.
   const route=semantic?(semantic.route==='existing'?{kind:'existing' as const,id:semantic.investigationId!}
     :semantic.route==='new'?{kind:'new' as const,topic:semantic.topic!}:null)
     :interpreted.status==='disabled'?routeInvestigation(userMessage,subjects,legacyActiveId,lastAssistant):null;
   const investigation=route?.kind==='existing'?await readInvestigationState(a,id,route.id):null;
   const routingFailed=interpreted.status!=='accepted'&&interpreted.status!=='disabled';
   const clarification=routingFailed?'Não consegui interpretar o contexto desta mensagem com segurança. Pode informar qual assunto deseja consultar?':
     route?.kind==='clarify'?route.question:route?.kind==='existing'&&!investigation
     ?'O contexto anterior não está disponível. Qual sistema ou equipamento você quer investigar agora?':null;
   const investigationId=investigation?.id??(route?.kind==='new'?randomUUID():null);
   const topic=investigation?.topic??(route?.kind==='new'?route.topic:null);
   const draft=topic?(semantic?applySemanticMemory(topic,semantic,investigation??undefined)
     :updateInvestigationFromMessage(topic,userMessage,investigation??undefined,investigation?.id===legacyActiveId?lastAssistant:undefined)):null;
   // Unrelated subjects never become the selected agent's working history.
   // The semantic query can carry a short clarification across a new route.
   const scopedHistory=semantic&&!investigationId?previous.rows.slice(0,8).filter((m,index,rows)=>m.investigation_id===null&&rows.slice(0,index).every(prior=>prior.investigation_id===null)):previous.rows.filter(message=>message.investigation_id===investigationId);
   const history=scopedHistory.reverse()
     .map(({role,content})=>({role,content}));
   const userMessageId=await transaction(async c=>{
     await requireCurrentActor(c,a);
     const owned=await c.query('SELECT id FROM conversations WHERE id=$1 AND user_id=$2 FOR SHARE',[id,a.id]);
     if(!owned.rowCount)throw Object.assign(new Error('Conversa removida'),{statusCode:404});
     const inserted=await c.query("INSERT INTO messages(conversation_id,role,content,auth_revision,investigation_id,idempotency_key) VALUES($1,'user',$2,$3,$4,$5) RETURNING id",
       [id,userMessage,a.auth_revision,investigationId,idempotencyKey??null]);
     return inserted.rows[0].id as string;
   });
   try {
     const output=clarification ? {answer:clarification,sources:[],pendingActions:[],...(routingFailed?{
       metrics:{...budget.metrics('provider_failure'),readAttempts:0,readsWithNewEvidence:0,evidenceCount:0,emptyReads:0,duplicateReads:0,readTimeouts:0,unavailableReads:0,inaccessibleReads:0,stalledSteps:0,clarificationRequests:0,conflicts:0,blockedWriteRetries:0,semanticTurnStatus:interpreted.status}
     }:{})} :
       await runAgent(a,id,userMessage,history,undefined,undefined,{investigation:investigation??undefined,semantic,semanticTurnStatus:interpreted.status,budget,
         ...(semantic?.route==='uncertain'?{subjectCandidates:subjects.map(s=>s.topic).slice(0,12)}:{})});
     // Bounded categorical and numeric diagnostic signal. Never log prompts, document excerpts or secrets.
     if(output.metrics)req.log.info({agent:output.metrics},'Agent turn finished');
     // Hold a shared account lock while saving the reply. Permission changes
     // must serialize either entirely before or after this commit.
     const sources=output.sources.map(s=>({documentId:s.documentId,versionId:s.versionId,versionNumber:s.versionNumber,title:s.title,ordinal:s.ordinal,
       ...(s.historical?{historical:true}:{}),...(s.excerpts?{excerpts:s.excerpts}:{})}));
     const saved=await transaction(async c=>{
       await requireCurrentActor(c,a);
       const conversation=await c.query('SELECT id FROM conversations WHERE id=$1 AND user_id=$2 FOR SHARE',[id,a.id]);
       if(!conversation.rowCount)throw Object.assign(new Error('Conversa removida'),{statusCode:404});
       if(investigationId && draft){
         const state=await saveInvestigationState(a,id,draft,{id:investigationId,expectedRevision:investigation?.revision??null},c);
         if(state.status!=='saved')return null;
       }
       // Serializing on each cited document prevents an archived or superseded
       // procedure being presented as current after the model has responded.
       for(const source of sources){
         const live=await c.query(`SELECT d.id FROM documents d
           JOIN document_versions v ON v.document_id=d.id AND v.id=$2
           JOIN spaces s ON s.id=d.space_id
           LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$3
           WHERE d.id=$1 AND d.archived_at IS NULL AND v.index_status='READY'
             AND (CASE WHEN $4::boolean THEN d.current_version_id<>v.id AND v.status='ARCHIVED'
                       ELSE d.current_version_id=v.id AND v.status='PUBLISHED' END)
             AND (s.visibility='SHARED' OR COALESCE(g.can_read,false))
           FOR SHARE OF d`,[source.documentId,source.versionId,a.id,source.historical===true]);
         if(!live.rowCount)
           throw Object.assign(new Error('Fonte arquivada ou atualizada durante a resposta'),{statusCode:409});
       }
       const result=await c.query(`INSERT INTO messages(conversation_id,role,content,sources,auth_revision,investigation_id,context_source_version_ids,reply_to_message_id)
         VALUES($1,'assistant',$2,$3,$4,$5,$6::uuid[],$7) RETURNING id`,
       [id,output.answer,JSON.stringify(sources),a.auth_revision,investigationId,investigation?.sourceVersionIds??[],userMessageId]);
       return result.rows[0].id as string;
     });
     if(!saved)return reply.code(409).send({error:'O estado da investigação mudou ou ficou indisponível. Reenvie a pergunta para retomar o assunto.'});

     // Record telemetry for successful turn
     const latencyMs=Date.now()-(req as any).telemetryStart;
     await recordTurnTelemetry({
       requestId:req.id,
       conversationId:id,
       userId:a.id,
       latencyMs,
       httpStatus:200,
       agentMetrics:output.metrics,
       idempotentHit:false
     });

     return {id:saved,answer:output.answer,sources,pendingActions:output.pendingActions};
   }catch(error){
     const statusCode=(error as {statusCode?:number})?.statusCode;
     const latencyMs=Date.now()-(req as any).telemetryStart;
     const errorType=safeErrorType(error);

     if(statusCode===403){
       await recordTurnTelemetry({
         requestId:req.id,conversationId:id,userId:a.id,latencyMs,httpStatus:403,
         agentMetrics:undefined,errorType,idempotentHit:false
       });
       return reply.code(403).send({error:'Permissões alteradas durante a consulta; entre novamente para continuar'});
     }
     if(statusCode===404){
       await recordTurnTelemetry({
         requestId:req.id,conversationId:id,userId:a.id,latencyMs,httpStatus:404,
         agentMetrics:undefined,errorType,idempotentHit:false
       });
       return reply.code(404).send({error:'A conversa foi excluída enquanto o agente respondia'});
     }
     if(statusCode===409){
       await recordTurnTelemetry({
         requestId:req.id,conversationId:id,userId:a.id,latencyMs,httpStatus:409,
         agentMetrics:undefined,errorType,idempotentHit:false
       });
       return reply.code(409).send({error:'O procedimento consultado foi arquivado ou atualizado. Refaça a pergunta para buscar a versão atual.'});
     }
     req.log.error({errorType},'Agent execution failed');
     await recordTurnTelemetry({
       requestId:req.id,conversationId:id,userId:a.id,latencyMs,httpStatus:503,
       agentMetrics:undefined,errorType,idempotentHit:false
     });
     return reply.code(503).send({error:'Não foi possível consultar o agente agora. Tente novamente.'});
   }
   });
   if(turn.busy){
     if(turn.retryAfterMs) reply.header('Retry-After', Math.ceil(turn.retryAfterMs/1000).toString());
     return reply.code(409).send({error:'Já existe uma mensagem em processamento nesta conversa. Tente novamente após a resposta.'});
   }

   return turn.value;
  });
}