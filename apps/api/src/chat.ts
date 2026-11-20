import type {FastifyInstance} from 'fastify';
import {query} from './db.js';
import {requireActor} from './auth.js';
import {respond} from './agent.js';
import {hasSecrets} from './knowledge.js';
export function registerChat(app:FastifyInstance) {
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
   const messages=await query(`SELECT id,role,content,sources,created_at FROM messages
     WHERE conversation_id=$1 AND auth_revision=$2
     ORDER BY created_at DESC,id DESC LIMIT 100`,[id,a.auth_revision]);
   const pending=await query(`SELECT p.id,p.title,p.content,s.name AS "spaceName"
     FROM pending_actions p JOIN spaces s ON s.id=p.space_id
     LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$2
     WHERE p.conversation_id=$1 AND p.user_id=$2
       AND p.result_version_id IS NULL AND p.expires_at>now()
       AND (s.visibility='SHARED' OR COALESCE(g.can_edit,false))
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
   const previous=await query('SELECT role,content FROM messages WHERE conversation_id=$1 AND auth_revision=$2 ORDER BY created_at DESC LIMIT 8',[id,a.auth_revision]);
   const history=previous.rows.reverse();
   const sent=await query("INSERT INTO messages(conversation_id,role,content,auth_revision) VALUES($1,'user',$2,$3) RETURNING id",[id,b.message,a.auth_revision]);
   try {
     const output=await respond(a,id,b.message,history);
     // Revocation during LLM execution must invalidate the result.
     const latest=await query('SELECT active,auth_revision FROM users WHERE id=$1',[a.id]);
     if(!latest.rows[0]?.active||latest.rows[0].auth_revision!==a.auth_revision) return reply.code(403).send({error:'Permissões alteradas durante a consulta; reinicie a conversa'});
     const sources=output.sources.map(s=>({documentId:s.documentId,versionId:s.versionId,versionNumber:s.versionNumber,title:s.title,ordinal:s.ordinal}));
     const saved=await query(`INSERT INTO messages(conversation_id,role,content,sources,auth_revision)
       VALUES($1,'assistant',$2,$3,$4) RETURNING id`,[id,output.answer,JSON.stringify(sources),a.auth_revision]);
     return {id:saved.rows[0].id,answer:output.answer,sources,pendingActions:output.pendingActions};
   }catch(error){
     req.log.error({err:error instanceof Error?error.message:'unknown'},'Agent execution failed');
     return reply.code(503).send({error:'Não foi possível consultar o agente agora. Tente novamente.'});
   }
 });
}
