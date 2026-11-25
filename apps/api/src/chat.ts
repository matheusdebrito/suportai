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
import {routeInvestigation,updateInvestigationFromMessage} from './investigation-dialogue.js';

const inaccessibleContext=`EXISTS (
  SELECT 1 FROM unnest(m.context_source_version_ids) AS context(version_id)
  WHERE NOT EXISTS (
    SELECT 1 ${visibleInvestigationVersions('$3')} AND v.id=context.version_id
  )
)`;

export function registerChat(app:FastifyInstance,runAgent:typeof respond=respond) {
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
   const b=req.body as {message?:unknown}|undefined;
   if(typeof b?.message!=='string'||b.message.trim().length===0||b.message.length>4000) return reply.code(400).send({error:'Mensagem inválida'});
   const userMessage=b.message;
   if(hasSecrets(userMessage)) return reply.code(422).send({error:'Possível credencial detectada. Remova senhas e tokens antes de enviar.'});
   // Acquire before reading the conversation or writing the user message.
   // Competing turns get 409 instead of racing with stale history.
   const turn=await withConversationTurnLock(id,async()=>{
   const conv=await query('SELECT id FROM conversations WHERE id=$1 AND user_id=$2',[id,a.id]);
   if(!conv.rowCount) return reply.code(404).send({error:'Conversa não encontrada'});
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
   const route=routeInvestigation(userMessage,subjects,previous.rows[0]?.investigation_id??null);
   const investigation=route?.kind==='existing' ? await readInvestigationState(a,id,route.id) : null;
   const clarification=route?.kind==='clarify' ? route.question : route?.kind==='existing'&&!investigation
     ? 'O contexto anterior não está disponível. Qual sistema ou equipamento você quer investigar agora?' : null;
   const investigationId=investigation?.id??(route?.kind==='new' ? randomUUID() : null);
   const topic=investigation?.topic??(route?.kind==='new' ? route.topic : null);
   const draft=topic ? updateInvestigationFromMessage(topic,userMessage,investigation??undefined) : null;
   // Older transcripts can inform this turn only when they belong to the selected subject.
   const history=previous.rows.filter(message=>message.investigation_id===investigationId).reverse()
     .map(({role,content})=>({role,content}));
   await transaction(async c=>{
     await requireCurrentActor(c,a);
     const owned=await c.query('SELECT id FROM conversations WHERE id=$1 AND user_id=$2 FOR SHARE',[id,a.id]);
     if(!owned.rowCount)throw Object.assign(new Error('Conversa removida'),{statusCode:404});
     await c.query("INSERT INTO messages(conversation_id,role,content,auth_revision,investigation_id) VALUES($1,'user',$2,$3,$4)",
       [id,userMessage,a.auth_revision,investigationId]);
   });
   try {
     const output=clarification ? {answer:clarification,sources:[],pendingActions:[]} :
       await runAgent(a,id,userMessage,history,undefined,undefined,{investigation:investigation??undefined});
     // Numeric-only diagnostic signal. Never log prompts, document excerpts or secrets.
     if(output.metrics)req.log.info({agent:output.metrics},'Agent turn finished');
     // Hold a shared account lock while saving the reply. Permission changes
     // must serialize either entirely before or after this commit.
     const sources=output.sources.map(s=>({documentId:s.documentId,versionId:s.versionId,versionNumber:s.versionNumber,title:s.title,ordinal:s.ordinal}));
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
           WHERE d.id=$1 AND d.current_version_id=$2 AND d.archived_at IS NULL
             AND v.status='PUBLISHED' AND v.index_status='READY'
             AND (s.visibility='SHARED' OR COALESCE(g.can_read,false))
           FOR SHARE OF d`,[source.documentId,source.versionId,a.id]);
         if(!live.rowCount)
           throw Object.assign(new Error('Fonte arquivada ou atualizada durante a resposta'),{statusCode:409});
       }
       const result=await c.query(`INSERT INTO messages(conversation_id,role,content,sources,auth_revision,investigation_id,context_source_version_ids)
         VALUES($1,'assistant',$2,$3,$4,$5,$6::uuid[]) RETURNING id`,
       [id,output.answer,JSON.stringify(sources),a.auth_revision,investigationId,investigation?.sourceVersionIds??[]]);
       return result.rows[0].id as string;
     });
     if(!saved)return reply.code(409).send({error:'O estado da investigação mudou ou ficou indisponível. Reenvie a pergunta para retomar o assunto.'});
     return {id:saved,answer:output.answer,sources,pendingActions:output.pendingActions};
   }catch(error){
     if((error as {statusCode?:number})?.statusCode===403)
       return reply.code(403).send({error:'Permissões alteradas durante a consulta; entre novamente para continuar'});
     if((error as {statusCode?:number})?.statusCode===404)
       return reply.code(404).send({error:'A conversa foi excluída enquanto o agente respondia'});
     if((error as {statusCode?:number})?.statusCode===409)
       return reply.code(409).send({error:'O procedimento consultado foi arquivado ou atualizado. Refaça a pergunta para buscar a versão atual.'});
     req.log.error({errorType:safeErrorType(error)},'Agent execution failed');
     return reply.code(503).send({error:'Não foi possível consultar o agente agora. Tente novamente.'});
   }
   });
   if(turn.busy)return reply.code(409).send({error:'Já existe uma mensagem em processamento nesta conversa. Tente novamente após a resposta.'});
   return turn.value;
 });
}
