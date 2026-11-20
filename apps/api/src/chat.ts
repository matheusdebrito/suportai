import type {FastifyInstance} from 'fastify';
import {query,transaction} from './db.js';
import {requireActor} from './auth.js';
import {requireCurrentActor} from './security.js';
import {respond} from './agent.js';
import {hasSecrets} from './knowledge.js';
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
       CASE WHEN COALESCE(jsonb_array_length(live_sources.items),0)<>jsonb_array_length(m.sources)
         THEN 'Esta resposta contém fontes arquivadas ou inacessíveis e não pode mais ser exibida.'
         ELSE m.content END AS content,
       CASE WHEN COALESCE(jsonb_array_length(live_sources.items),0)<>jsonb_array_length(m.sources)
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
 app.post('/conversations/:id/messages',async(req,reply)=>{
   const a=await requireActor(req);const id=(req.params as {id:string}).id;
   const b=req.body as {message?:unknown}|undefined;
   if(typeof b?.message!=='string'||b.message.trim().length===0||b.message.length>4000) return reply.code(400).send({error:'Mensagem inválida'});
   if(hasSecrets(b.message)) return reply.code(422).send({error:'Possível credencial detectada. Remova senhas e tokens antes de enviar.'});
   const conv=await query('SELECT id FROM conversations WHERE id=$1 AND user_id=$2',[id,a.id]);
   if(!conv.rowCount) return reply.code(404).send({error:'Conversa não encontrada'});
   // Never pass inaccessible cited content back into the model's memory.
   // This is a read-time projection; the original message is retained for audit.
   const previous=await query(`SELECT m.role,
      CASE WHEN EXISTS (
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
    ORDER BY m.created_at DESC,m.id DESC LIMIT 8`,[id,a.auth_revision,a.id]);
   const history=previous.rows.reverse();
   const sent=await query("INSERT INTO messages(conversation_id,role,content,auth_revision) VALUES($1,'user',$2,$3) RETURNING id",[id,b.message,a.auth_revision]);
   try {
     const output=await runAgent(a,id,b.message,history);
     // Hold a shared account lock while saving the reply. Permission changes
     // must serialize either entirely before or after this commit.
     const sources=output.sources.map(s=>({documentId:s.documentId,versionId:s.versionId,versionNumber:s.versionNumber,title:s.title,ordinal:s.ordinal}));
     const saved=await transaction(async c=>{
       await requireCurrentActor(c,a);
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
       const result=await c.query(`INSERT INTO messages(conversation_id,role,content,sources,auth_revision)
         VALUES($1,'assistant',$2,$3,$4) RETURNING id`,[id,output.answer,JSON.stringify(sources),a.auth_revision]);
       return result.rows[0].id as string;
     });
     return {id:saved,answer:output.answer,sources,pendingActions:output.pendingActions};
   }catch(error){
     if((error as {statusCode?:number})?.statusCode===403)
       return reply.code(403).send({error:'Permissões alteradas durante a consulta; entre novamente para continuar'});
     if((error as {statusCode?:number})?.statusCode===409)
       return reply.code(409).send({error:'O procedimento consultado foi arquivado ou atualizado. Refaça a pergunta para buscar a versão atual.'});
     req.log.error({err:error instanceof Error?error.message:'unknown'},'Agent execution failed');
     return reply.code(503).send({error:'Não foi possível consultar o agente agora. Tente novamente.'});
   }
 });
}
