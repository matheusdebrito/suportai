import type {FastifyInstance} from 'fastify';
import {query,transaction,audit} from './db.js';
import {requireActor} from './auth.js';
import {spacePermission,type Actor} from './security.js';
export function hasSecrets(text:string) {
 return /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?[a-z0-9_\-]{12,}/i.test(text);
}
export function chunks(text:string,size=1100,overlap=150) {
 const out:string[]=[];
 for(let start=0;start<text.length;start+=size-overlap){out.push(text.slice(start,start+size)); if(start+size>=text.length)break;}
 return out;
}
async function createVersion(actor:Actor,spaceId:string,title:string,content:string,kind:'ARTICLE'|'PDF',pdfBytes?:Buffer,documentId?:string,baseVersionId?:string) {
 const p=await spacePermission(actor,spaceId);
 if(!p?.edit) throw Object.assign(new Error('Sem permissão para escrever neste espaço'),{statusCode:403});
 if(hasSecrets(content)) throw Object.assign(new Error('Possível credencial detectada. Remova-a antes de enviar'),{statusCode:422});
 const result=await transaction(async c=>{
   let docId=documentId;
   let versionNo=1;
   if(docId){
     const doc=await c.query('SELECT id,space_id,current_version_id FROM documents WHERE id=$1 FOR UPDATE',[docId]);
     if(!doc.rowCount || doc.rows[0].space_id!==spaceId) throw Object.assign(new Error('Documento não encontrado'),{statusCode:404});
     if(doc.rows[0].current_version_id!==baseVersionId) throw Object.assign(new Error('O documento foi alterado. Atualize a prévia'),{statusCode:409});
     const count=await c.query('SELECT COALESCE(MAX(version_number),0)+1 AS next FROM document_versions WHERE document_id=$1',[docId]);
     versionNo=Number(count.rows[0].next);
   } else {
     const doc=await c.query('INSERT INTO documents(space_id,title,kind) VALUES($1,$2,$3) RETURNING id',[spaceId,title,kind]);
     docId=doc.rows[0].id;
   }
   const ver=await c.query(`INSERT INTO document_versions(document_id,version_number,status,content,pdf_bytes,authored_by,base_version_id)
    VALUES($1,$2,'DRAFT',$3,$4,$5,$6) RETURNING id`,[docId,versionNo,content,pdfBytes??null,actor.id,baseVersionId??null]);
   await c.query('INSERT INTO ingestion_jobs(version_id) VALUES($1)',[ver.rows[0].id]);
   await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'KNOWLEDGE_DRAFT_CREATED',$2)",[actor.id,docId]);
   return {documentId:docId!,versionId:ver.rows[0].id};
 });
 return result;
}
async function authorizedDoc(actor:Actor,documentId:string) {
 const r=await query('SELECT d.*,s.visibility FROM documents d JOIN spaces s ON s.id=d.space_id WHERE d.id=$1',[documentId]);
 const doc=r.rows[0];
 if(!doc) throw Object.assign(new Error('Documento não encontrado'),{statusCode:404});
 const p=await spacePermission(actor,doc.space_id);
 if(!p?.read) throw Object.assign(new Error('Documento não encontrado'),{statusCode:404});
 return {doc,p};
}
export function registerKnowledge(app:FastifyInstance) {
 app.get('/knowledge/documents',async req=>{
   const a=await requireActor(req);
   const r=await query(`SELECT d.id,d.title,d.kind,d.current_version_id,s.name AS space_name
   FROM documents d JOIN spaces s ON s.id=d.space_id
   LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$1
   WHERE d.current_version_id IS NOT NULL AND d.archived_at IS NULL
    AND (s.visibility='SHARED' OR COALESCE(g.can_read,false))
   ORDER BY d.created_at DESC LIMIT 150`,[a.id]);
   return {documents:r.rows};
 });
 app.get('/knowledge/documents/:id',async req=>{
   const a=await requireActor(req);
   const {doc}=await authorizedDoc(a,(req.params as {id:string}).id);
   const r=await query("SELECT id,version_number,content,status FROM document_versions WHERE id=$1 AND status='PUBLISHED'",[doc.current_version_id]);
   if(!r.rowCount) throw Object.assign(new Error('Documento não encontrado'),{statusCode:404});
   return {id:doc.id,title:doc.title,kind:doc.kind,version:r.rows[0]};
 });
 app.post('/knowledge/articles',async(req,reply)=>{
   const a=await requireActor(req);
   const b=req.body as {spaceId?:unknown;title?:unknown;content?:unknown}|undefined;
   if(typeof b?.spaceId!=='string'||typeof b.title!=='string'||typeof b.content!=='string'||b.title.length<3||b.title.length>200||b.content.length<20||b.content.length>100000) return reply.code(400).send({error:'Artigo inválido'});
   return reply.code(201).send(await createVersion(a,b.spaceId,b.title,b.content,'ARTICLE'));
 });
 app.post('/knowledge/documents/:id/versions',async(req,reply)=>{
   const a=await requireActor(req);
   const docId=(req.params as {id:string}).id;
   const {doc,p}=await authorizedDoc(a,docId);
   if(!p.edit) return reply.code(403).send({error:'Sem permissão'});
   const b=req.body as {content?:unknown;baseVersionId?:unknown}|undefined;
   if(typeof b?.content!=='string'||b.content.length<20||b.content.length>100000||typeof b.baseVersionId!=='string'||doc.kind!=='ARTICLE') return reply.code(400).send({error:'Atualização inválida'});
   return reply.code(201).send(await createVersion(a,doc.space_id,doc.title,b.content,'ARTICLE',undefined,docId,b.baseVersionId));
 });
 app.post('/knowledge/pdfs',async(req,reply)=>{
   const a=await requireActor(req);
   const pdf=await req.file({limits:{fileSize:8*1024*1024,files:1}});
   if(!pdf) return reply.code(400).send({error:'PDF obrigatório'});
   const field=pdf.fields.spaceId;
   const spaceId=field && !Array.isArray(field) && 'value' in field && typeof field.value==='string' ? field.value : '';
   const p=await spacePermission(a,spaceId);
   if(!p?.edit) return reply.code(403).send({error:'Sem permissão'});
   if(pdf.mimetype!=='application/pdf'||!pdf.filename.toLowerCase().endsWith('.pdf')) return reply.code(415).send({error:'Formato não suportado'});
   const bytes=await pdf.toBuffer();
   if(bytes.length<8||bytes.subarray(0,5).toString()!=='%PDF-') return reply.code(415).send({error:'PDF inválido'});
   const title=pdf.filename.slice(0,160);
   return reply.code(201).send(await createVersion(a,spaceId,title,'','PDF',bytes));
 });
 app.get('/knowledge/reviews',async req=>{
   const a=await requireActor(req);
   if(a.role!=='APPROVER') return {reviews:[]};
   const r=await query(`SELECT v.id AS version_id,v.status,v.index_status,v.content,j.error AS ingestion_error,d.id AS document_id,d.title,s.name AS space_name
    FROM document_versions v JOIN documents d ON d.id=v.document_id JOIN spaces s ON s.id=d.space_id
    LEFT JOIN ingestion_jobs j ON j.version_id=v.id
    LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$1
    WHERE v.status IN ('DRAFT','IN_REVIEW') AND (s.visibility='SHARED' OR COALESCE(g.can_approve,false))
    ORDER BY v.created_at DESC LIMIT 100`,[a.id]);
   return {reviews:r.rows};
 });
 app.post('/knowledge/versions/:id/retry',async(req,reply)=>{
   const a=await requireActor(req);const id=(req.params as {id:string}).id;
   const r=await query('SELECT d.space_id,v.status,v.index_status FROM document_versions v JOIN documents d ON d.id=v.document_id WHERE v.id=$1',[id]);
   if(!r.rowCount) return reply.code(404).send({error:'Versão não encontrada'});
   const p=await spacePermission(a,r.rows[0].space_id);
   if(!p?.edit) return reply.code(403).send({error:'Sem permissão'});
   if(!['DRAFT','IN_REVIEW'].includes(r.rows[0].status)||r.rows[0].index_status!=='FAILED') return reply.code(409).send({error:'Não há falha pendente de reprocessamento'});
   await transaction(async c=>{
      const updated=await c.query("UPDATE ingestion_jobs SET status='PENDING',error=NULL,updated_at=now() WHERE version_id=$1 AND status='FAILED' RETURNING version_id",[id]);
      if(!updated.rowCount) throw Object.assign(new Error('Job não pode ser reprocessado'),{statusCode:409});
      await c.query("UPDATE document_versions SET index_status='PENDING' WHERE id=$1",[id]);
      await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'KNOWLEDGE_REINDEX_REQUESTED',$2)",[a.id,id]);
   });
   return {ok:true};
 });
 app.post('/knowledge/versions/:id/submit-review',async(req,reply)=>{
   const a=await requireActor(req);
   const id=(req.params as {id:string}).id;
   const v=await query('SELECT d.space_id,v.authored_by FROM document_versions v JOIN documents d ON d.id=v.document_id WHERE v.id=$1',[id]);
   if(!v.rowCount) return reply.code(404).send({error:'Versão não encontrada'});
   const p=await spacePermission(a,v.rows[0].space_id);
   if(!p?.edit) return reply.code(403).send({error:'Sem permissão'});
   const r=await query("UPDATE document_versions SET status='IN_REVIEW' WHERE id=$1 AND status='DRAFT' RETURNING id",[id]);
   return r.rowCount?{ok:true}:reply.code(409).send({error:'Estado inválido'});
 });
 app.post('/knowledge/versions/:id/publish',async(req,reply)=>{
   const a=await requireActor(req);
   const id=(req.params as {id:string}).id;
   const b=req.body as {confirm?:unknown}|undefined;
   if(b?.confirm!==true) return reply.code(400).send({error:'Confirmação humana obrigatória'});
   const outcome=await transaction(async c=>{
     const r=await c.query(`SELECT v.*,d.space_id,d.current_version_id,s.visibility,g.can_approve
        FROM document_versions v JOIN documents d ON d.id=v.document_id JOIN spaces s ON s.id=d.space_id
        LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$2 WHERE v.id=$1 FOR UPDATE OF v,d`,[id,a.id]);
     const v=r.rows[0];
     if(!v) return 'NOT_FOUND';
     if(a.role!=='APPROVER'||!(v.visibility==='SHARED'||v.can_approve)) return 'FORBIDDEN';
     if(v.status==='PUBLISHED'&&v.current_version_id===v.id) return 'OK';
     if(v.status!=='IN_REVIEW'||v.index_status!=='READY') return 'NOT_READY';
     if(v.current_version_id!==v.base_version_id) return 'STALE';
     if(v.current_version_id) await c.query("UPDATE document_versions SET status='ARCHIVED' WHERE id=$1",[v.current_version_id]);
     await c.query("UPDATE document_versions SET status='PUBLISHED',reviewed_by=$2,reviewed_at=now() WHERE id=$1",[id,a.id]);
     await c.query('UPDATE documents SET current_version_id=$2 WHERE id=$1',[v.document_id,id]);
     await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'KNOWLEDGE_PUBLISHED',$2)",[a.id,v.document_id]);
     return 'OK';
   });
   if(outcome==='NOT_FOUND') return reply.code(404).send({error:'Versão não encontrada'});
   if(outcome==='FORBIDDEN') return reply.code(403).send({error:'Aprovação não autorizada'});
   if(outcome==='NOT_READY') return reply.code(409).send({error:'Versão não está revisada/indexada'});
   if(outcome==='STALE') return reply.code(409).send({error:'Outra versão foi publicada. Atualize a revisão antes de publicar'});
   return {ok:true};
 });
 app.post('/knowledge/versions/:id/reject',async(req,reply)=>{
   const a=await requireActor(req);
   const id=(req.params as {id:string}).id;
   const r=await query(`SELECT d.space_id FROM document_versions v JOIN documents d ON d.id=v.document_id WHERE v.id=$1`,[id]);
   if(!r.rowCount) return reply.code(404).send({error:'Versão não encontrada'});
   const p=await spacePermission(a,r.rows[0].space_id);
   if(!p?.approve) return reply.code(403).send({error:'Sem permissão'});
   const updated=await query("UPDATE document_versions SET status='REJECTED',reviewed_by=$2,reviewed_at=now() WHERE id=$1 AND status IN ('DRAFT','IN_REVIEW') RETURNING document_id",[id,a.id]);
   if(!updated.rowCount) return reply.code(409).send({error:'Estado inválido'});
   await audit(a.id,'KNOWLEDGE_REJECTED',updated.rows[0].document_id);
   return {ok:true};
 });
 app.post('/knowledge/pending/:id/confirm',async(req,reply)=>{
   const a=await requireActor(req);
   const id=(req.params as {id:string}).id;
   const result=await transaction(async c=>{
     const r=await c.query('SELECT * FROM pending_actions WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,a.id]);
     const pending=r.rows[0];
     if(!pending) return {error:'NOT_FOUND'};
     if(pending.result_version_id) return {documentId:pending.document_id,versionId:pending.result_version_id};
     if(pending.expires_at<=new Date()) return {error:'EXPIRED'};
     const p=await spacePermission(a,pending.space_id);
     if(!p?.edit) return {error:'FORBIDDEN'};
     if(hasSecrets(pending.content)) return {error:'SECRETS'};
     let docId=pending.document_id;let version=1;
     if(docId){
       const old=await c.query('SELECT current_version_id FROM documents WHERE id=$1 FOR UPDATE',[docId]);
       if(!old.rowCount||old.rows[0].current_version_id!==pending.base_version_id) return {error:'STALE'};
       const count=await c.query('SELECT COALESCE(MAX(version_number),0)+1 AS next FROM document_versions WHERE document_id=$1',[docId]);
       version=Number(count.rows[0].next);
     } else {
       const doc=await c.query("INSERT INTO documents(space_id,title,kind) VALUES($1,$2,'ARTICLE') RETURNING id",[pending.space_id,pending.title]);
       docId=doc.rows[0].id;
     }
     const v=await c.query("INSERT INTO document_versions(document_id,version_number,status,content,authored_by,base_version_id) VALUES($1,$2,'DRAFT',$3,$4,$5) RETURNING id",[docId,version,pending.content,a.id,pending.base_version_id]);
     await c.query('INSERT INTO ingestion_jobs(version_id) VALUES($1)',[v.rows[0].id]);
     await c.query('UPDATE pending_actions SET result_version_id=$2,confirmed_at=now() WHERE id=$1',[id,v.rows[0].id]);
     await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'KNOWLEDGE_DRAFT_CREATED',$2)",[a.id,docId]);
     return {documentId:docId,versionId:v.rows[0].id};
   });
   if('error' in result) return reply.code(result.error==='FORBIDDEN'?403:result.error==='NOT_FOUND'?404:409).send({error:result.error});
   return result;
 });
 app.post('/feedback',async(req,reply)=>{
   const a=await requireActor(req);
   const b=req.body as {messageId?:unknown;rating?:unknown;comment?:unknown}|undefined;
   if(typeof b?.messageId!=='string'||!['GOOD','BAD'].includes(String(b.rating))||typeof b.comment==='string'&&b.comment.length>1000) return reply.code(400).send({error:'Feedback inválido'});
   const r=await query(`INSERT INTO feedback(user_id,message_id,rating,comment)
     SELECT $1,m.id,$3,$4 FROM messages m JOIN conversations c ON c.id=m.conversation_id
     WHERE m.id=$2 AND c.user_id=$1 RETURNING id`,[a.id,b.messageId,b.rating,typeof b.comment==='string'?b.comment:null]);
   return r.rowCount?{ok:true}:reply.code(404).send({error:'Mensagem não encontrada'});
 });
}
