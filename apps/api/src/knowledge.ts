import type {FastifyInstance} from 'fastify';
import {query,transaction,audit} from './db.js';
import {requireActor} from './auth.js';
import {spacePermission,requireCurrentActor,canApprove,type Actor} from './security.js';
import {findSimilarPublished, validDuplicateReason, SimilarArticlesError} from './similar.js';
export function hasSecrets(text:string) {
 return /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|(?:api[_-]?key|secret|senha|password|token|authorization)\s*[:=]\s*(?:bearer\s+)?(?:["'][^"'\r\n]{12,}["']|[^\s"']{12,})|(?:ghp|gho|ghu|ghs|ghr)_[a-z0-9]{30,}|github_pat_[a-z0-9_]{25,}|sk-[a-z0-9_-]{20,}|AKIA[0-9A-Z]{16}/i.test(text);
}
// Operational equipment passwords are knowledge, not application authentication secrets.
export function hasInfrastructureSecrets(text:string){
 return /-----BEGIN [^\r\n]*PRIVATE KEY-----|(?:api[_-]?key|secret|token|authorization)\s*[:=]\s*(?:bearer\s+)?(?:["'][^"'\r\n]{12,}["']|[^\s"']{12,})|(?:ghp|gho|ghu|ghs|ghr)_[a-z0-9]{30,}|github_pat_[a-z0-9_]{25,}|sk-[a-z0-9_-]{20,}|AKIA[0-9A-Z]{16}/i.test(text);
}
async function readPdfBytes(file:{mimetype:string;filename:string;toBuffer:()=>Promise<Buffer>}|undefined):Promise<Buffer>{
 if(!file) throw Object.assign(new Error('PDF obrigatório'),{statusCode:400});
 if(file.mimetype!=='application/pdf'||!file.filename.toLowerCase().endsWith('.pdf'))
   throw Object.assign(new Error('Formato não suportado'),{statusCode:415});
 const bytes=await file.toBuffer();
 if(bytes.length<8||bytes.subarray(0,5).toString()!=='%PDF-')
   throw Object.assign(new Error('PDF inválido'),{statusCode:415});
 return bytes;
}
export function chunks(text:string,size=1100,overlap=150) {
 if(!Number.isInteger(size)||size<1||overlap<0||overlap>=size)throw new Error('Invalid chunk limits');
 const out:string[]=[];
 let start=0;
 while(start<text.length){
  let end=Math.min(start+size,text.length);
  if(end<text.length){
   const window=text.slice(start,end);
   const paragraph=window.lastIndexOf('\n\n');
   const line=window.lastIndexOf('\n');
   const space=window.lastIndexOf(' ');
   const boundary=[paragraph>=0?paragraph+2:0,line>=0?line+1:0,space>=0?space+1:0].find(n=>n>=size*0.55);
   if(boundary)end=start+boundary;
  }
  out.push(text.slice(start,end));
  if(end===text.length)break;
  const next=Math.max(start+1,end-overlap);
  const line=text.indexOf('\n',next);
  start=line>=next&&line<end?line+1:next;
 }
 return out;
}
async function createVersion(actor:Actor,spaceId:string,title:string,content:string,kind:'ARTICLE'|'PDF',pdfBytes?:Buffer,documentId?:string,baseVersionId?:string,duplicateReason?:string) {
 const p=await spacePermission(actor,spaceId);
 if(!p?.edit) throw Object.assign(new Error('Sem permissão para escrever neste espaço'),{statusCode:403});
 if(hasSecrets(title)||hasInfrastructureSecrets(content)) throw Object.assign(new Error('Possível credencial no título ou conteúdo. Remova-a antes de enviar'),{statusCode:422});
 if(duplicateReason && hasSecrets(duplicateReason)) throw Object.assign(new Error('Remova credenciais da justificativa'),{statusCode:422});
 if(kind==='ARTICLE' && !p.read)throw Object.assign(new Error('Permissão de leitura obrigatória para verificar artigos existentes'),{statusCode:403});
 const result=await transaction(async c=>{
   await requireCurrentActor(c,actor);
   let docId=documentId;
   let versionNo=1;
   let similarCount=0;
   if(docId){
     const doc=await c.query('SELECT id,space_id,kind,current_version_id,archived_at FROM documents WHERE id=$1 FOR UPDATE',[docId]);
     if(!doc.rowCount || doc.rows[0].space_id!==spaceId || doc.rows[0].kind!==kind || doc.rows[0].archived_at) throw Object.assign(new Error('Documento não encontrado'),{statusCode:404});
     if(doc.rows[0].current_version_id!==baseVersionId) throw Object.assign(new Error('O documento foi alterado. Atualize a prévia'),{statusCode:409});
     const count=await c.query('SELECT COALESCE(MAX(version_number),0)+1 AS next FROM document_versions WHERE document_id=$1',[docId]);
     versionNo=Number(count.rows[0].next);
   } else {
     if(kind==='ARTICLE'){
       // Serialize checks in this space to avoid stale preflight results.
       await c.query('SELECT id FROM spaces WHERE id=$1 FOR UPDATE',[spaceId]);
       const matches=await findSimilarPublished(spaceId,title,c,content);
       similarCount=matches.length;
       if(matches.length && !validDuplicateReason(duplicateReason)) throw new SimilarArticlesError(matches);
     }
     const doc=await c.query('INSERT INTO documents(space_id,title,kind) VALUES($1,$2,$3) RETURNING id',[spaceId,title,kind]);
     docId=doc.rows[0].id;
   }
   const ver=await c.query(`INSERT INTO document_versions(document_id,version_number,status,content,pdf_bytes,authored_by,base_version_id)
    VALUES($1,$2,'DRAFT',$3,$4,$5,$6) RETURNING id`,[docId,versionNo,content,pdfBytes??null,actor.id,baseVersionId??null]);
   await c.query('INSERT INTO ingestion_jobs(version_id) VALUES($1)',[ver.rows[0].id]);
   if(kind==='ARTICLE' && !documentId && similarCount>0 && validDuplicateReason(duplicateReason)){
     await c.query("INSERT INTO audit_events(actor_id,action,resource_id,metadata) VALUES($1,'KNOWLEDGE_DUPLICATE_ACKNOWLEDGED',$2,$3::jsonb)",
       [actor.id,docId,JSON.stringify({reason:duplicateReason})]);
   }
   await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'KNOWLEDGE_DRAFT_CREATED',$2)",[actor.id,docId]);
   return {documentId:docId!,versionId:ver.rows[0].id};
 });
 return result;
}
async function authorizedDoc(actor:Actor,documentId:string) {
 const r=await query('SELECT d.*,s.visibility FROM documents d JOIN spaces s ON s.id=d.space_id WHERE d.id=$1',[documentId]);
 const doc=r.rows[0];
 if(!doc || doc.archived_at) throw Object.assign(new Error('Documento não encontrado'),{statusCode:404});
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
 app.get('/knowledge/mine',async req=>{
   const a=await requireActor(req);
   const r=await query(`SELECT v.id AS version_id,d.id AS document_id,d.title,d.kind,
      v.version_number,v.status,v.index_status,v.review_note,v.created_at,
      s.name AS space_name,j.error AS ingestion_error
     FROM document_versions v
     JOIN documents d ON d.id=v.document_id
     JOIN spaces s ON s.id=d.space_id
     LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$1
     LEFT JOIN ingestion_jobs j ON j.version_id=v.id
     WHERE v.authored_by=$1 AND v.status IN ('DRAFT','IN_REVIEW','CHANGES_REQUESTED','REJECTED') AND v.superseded_by IS NULL
       AND d.archived_at IS NULL
       AND (s.visibility='SHARED' OR COALESCE(g.can_read,false)) AND COALESCE(g.can_edit,false)
     ORDER BY v.created_at DESC,v.id DESC LIMIT 100`,[a.id]);
   return {drafts:r.rows};
 });
 app.get('/knowledge/drafts/:id',async req=>{
   const a=await requireActor(req);
   const id=(req.params as {id:string}).id;
   const r=await query(`SELECT v.id AS version_id,v.document_id,v.version_number,
      v.status,v.index_status,v.review_note,v.content,d.title,d.kind,d.space_id,s.name AS space_name
     FROM document_versions v
     JOIN documents d ON d.id=v.document_id
     JOIN spaces s ON s.id=d.space_id
     LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$2
     WHERE v.id=$1 AND v.authored_by=$2
       AND v.status IN ('DRAFT','IN_REVIEW','CHANGES_REQUESTED','REJECTED') AND v.superseded_by IS NULL
       AND d.archived_at IS NULL
       AND (s.visibility='SHARED' OR COALESCE(g.can_read,false)) AND COALESCE(g.can_edit,false)`,[id,a.id]);
   if(!r.rowCount) throw Object.assign(new Error('Rascunho não encontrado'),{statusCode:404});
   return r.rows[0];
 });
 app.get('/knowledge/documents/:id',async req=>{
   const a=await requireActor(req);
   const {doc}=await authorizedDoc(a,(req.params as {id:string}).id);
   const r=await query("SELECT id,version_number,content,status FROM document_versions WHERE id=$1 AND status='PUBLISHED'",[doc.current_version_id]);
   if(!r.rowCount) throw Object.assign(new Error('Documento não encontrado'),{statusCode:404});
   return {id:doc.id,title:doc.title,kind:doc.kind,space_id:doc.space_id,version:r.rows[0]};
 });
 app.get('/knowledge/documents/:id/versions/:versionId',async req=>{
   const actor=await requireActor(req);
   const params=req.params as {id:string;versionId:string};
   const {doc}=await authorizedDoc(actor,params.id);
   // Historical citations remain resolvable only while the reader is authorized.
   // Drafts, rejected versions and revisions under review are never exposed.
   const version=await query(`SELECT id,version_number,content,status FROM document_versions
     WHERE id=$1 AND document_id=$2 AND status IN ('PUBLISHED','ARCHIVED')`,
     [params.versionId,doc.id]);
   if(!version.rowCount) throw Object.assign(new Error('Versão não encontrada'),{statusCode:404});
   return {id:doc.id,title:doc.title,kind:doc.kind,space_id:doc.space_id,version:version.rows[0],
     isCurrent:doc.current_version_id===params.versionId};
 });

 // Archiving is an explicit editorial action. It only changes document visibility,
 // never deletes the version history, source bytes or previously audited decisions.
 app.get('/knowledge/archived',async req=>{
   const actor=await requireActor(req);
   if(actor.role!=='APPROVER'&&actor.role!=='ADMIN')return {documents:[]};
   const rows=await query(`SELECT d.id,d.title,d.kind,d.archived_at,d.current_version_id,
       s.name AS space_name FROM documents d
       JOIN spaces s ON s.id=d.space_id
       LEFT JOIN space_grants g ON g.space_id=d.space_id AND g.user_id=$1
       WHERE d.archived_at IS NOT NULL AND d.current_version_id IS NOT NULL
         AND (($2='ADMIN' AND s.visibility='SHARED') OR (g.can_approve=true AND (s.visibility='SHARED' OR g.can_read=true)))
       ORDER BY d.archived_at DESC,d.id DESC LIMIT 100`,[actor.id,actor.role]);
   return {documents:rows.rows};
 });
 for(const action of ['archive','restore'] as const){
   app.post('/knowledge/documents/:id/'+action,async(req,reply)=>{
     const actor=await requireActor(req);
     const id=(req.params as {id:string}).id;
     const body=req.body as {confirm?:unknown}|undefined;
     if(body?.confirm!==true)return reply.code(400).send({error:'Confirmação humana obrigatória'});
     const outcome=await transaction(async c=>{
       await requireCurrentActor(c,actor);
       const found=await c.query(`SELECT d.id,d.archived_at,d.current_version_id,
         s.visibility,g.can_read,g.can_approve FROM documents d
         JOIN spaces s ON s.id=d.space_id
         LEFT JOIN space_grants g ON g.space_id=d.space_id AND g.user_id=$2
         WHERE d.id=$1 FOR UPDATE OF d`,[id,actor.id]);
       const doc=found.rows[0];
       if(!doc||!canApprove(actor.role,doc.visibility,doc))return 'NOT_FOUND';
       if(!doc.current_version_id)return 'NO_PUBLISHED';
       if(action==='archive'){
         if(doc.archived_at)return 'UNCHANGED';
         await c.query('UPDATE documents SET archived_at=now() WHERE id=$1',[id]);
       }else{
         if(!doc.archived_at)return 'UNCHANGED';
         const version=await c.query('SELECT status,index_status FROM document_versions WHERE id=$1 AND document_id=$2',
           [doc.current_version_id,id]);
         if(version.rows[0]?.status!=='PUBLISHED'||version.rows[0]?.index_status!=='READY')
           return 'NOT_READY';
         await c.query('UPDATE documents SET archived_at=NULL WHERE id=$1',[id]);
       }
       await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,$2,$3)",
         [actor.id,action==='archive'?'KNOWLEDGE_ARCHIVED':'KNOWLEDGE_RESTORED',id]);
       return 'UPDATED';
     });
     if(outcome==='NOT_FOUND')return reply.code(404).send({error:'Documento não encontrado ou não autorizado'});
     if(outcome==='NO_PUBLISHED'||outcome==='NOT_READY')
       return reply.code(409).send({error:'Documento sem versão publicada e indexada'});
     return {ok:true,archived:action==='archive'};
   });
 }
 app.post('/knowledge/articles',async(req,reply)=>{
   const a=await requireActor(req);
   const b=req.body as {spaceId?:unknown;title?:unknown;content?:unknown;duplicateReason?:unknown}|undefined;
   if(typeof b?.spaceId!=='string'||typeof b.title!=='string'||typeof b.content!=='string'||b.title.length<3||b.title.length>200||b.content.length<20||b.content.length>100000) return reply.code(400).send({error:'Artigo inválido'});
   const reason=typeof b.duplicateReason==='string'?b.duplicateReason.trim():undefined;
   try{return reply.code(201).send(await createVersion(a,b.spaceId,b.title,b.content,'ARTICLE',undefined,undefined,undefined,reason));}
   catch(error){
     if(error instanceof SimilarArticlesError)return reply.code(409).send({error:'Há artigos semelhantes. Abra o existente ou justifique a criação de outro.',code:'SIMILAR_ARTICLES',matches:error.matches});
     throw error;
   }
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
   const bytes=await readPdfBytes(pdf);
   const title=pdf.filename.slice(0,160);
   return reply.code(201).send(await createVersion(a,spaceId,title,'','PDF',bytes));
 });
 app.post('/knowledge/documents/:id/pdf-versions',async(req,reply)=>{
   const actor=await requireActor(req);
   const documentId=(req.params as {id:string}).id;
   const {doc,p}=await authorizedDoc(actor,documentId);
   if(!p.edit) return reply.code(403).send({error:'Sem permissão de edição'});
   if(doc.kind!=='PDF') return reply.code(415).send({error:'Documento não é um PDF'});
   if(doc.archived_at) return reply.code(404).send({error:'Documento não encontrado'});
   if(!doc.current_version_id) return reply.code(409).send({error:'O PDF ainda não possui uma versão publicada'});
   const file=await req.file({limits:{fileSize:8*1024*1024,files:1}});
   const baseField=file?.fields.baseVersionId;
   const baseVersionId=baseField && !Array.isArray(baseField) && 'value' in baseField
     && typeof baseField.value==='string' ? baseField.value : '';
   if(!baseVersionId)return reply.code(400).send({error:'Versão-base obrigatória'});
   if(baseVersionId!==doc.current_version_id)return reply.code(409).send({error:'O documento foi atualizado. Abra a versão publicada novamente'});
   const bytes=await readPdfBytes(file);
   return reply.code(201).send(await createVersion(actor,doc.space_id,doc.title,'','PDF',
     bytes,doc.id,baseVersionId));
 });
 app.get('/knowledge/reviews',async req=>{
   const a=await requireActor(req);
   if(a.role!=='APPROVER'&&a.role!=='ADMIN') return {reviews:[]};
   const r=await query(`SELECT v.id AS version_id,v.status,v.index_status,v.content,base.content AS base_content,j.error AS ingestion_error,d.id AS document_id,d.title,s.name AS space_name
    FROM document_versions v JOIN documents d ON d.id=v.document_id JOIN spaces s ON s.id=d.space_id
    LEFT JOIN document_versions base ON base.id=v.base_version_id
    LEFT JOIN ingestion_jobs j ON j.version_id=v.id
    LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$1
    WHERE v.status='IN_REVIEW' AND d.archived_at IS NULL AND v.superseded_by IS NULL AND (($2='ADMIN' AND s.visibility='SHARED') OR ((s.visibility='SHARED' OR COALESCE(g.can_read,false)) AND COALESCE(g.can_approve,false)))
    ORDER BY v.created_at DESC LIMIT 100`,[a.id,a.role]);
   return {reviews:r.rows};
 });
 app.post('/knowledge/versions/:id/retry',async(req,reply)=>{
   const a=await requireActor(req);const id=(req.params as {id:string}).id;
   const r=await query('SELECT d.space_id,v.status,v.index_status FROM document_versions v JOIN documents d ON d.id=v.document_id WHERE v.id=$1 AND d.archived_at IS NULL',[id]);
   if(!r.rowCount) return reply.code(404).send({error:'Versão não encontrada'});
   const p=await spacePermission(a,r.rows[0].space_id);
   if(!p?.edit) return reply.code(403).send({error:'Sem permissão'});
   if(!['DRAFT','IN_REVIEW'].includes(r.rows[0].status)||r.rows[0].index_status!=='FAILED') return reply.code(409).send({error:'Não há falha pendente de reprocessamento'});
   await transaction(async c=>{
      await requireCurrentActor(c,a);
      const updated=await c.query("UPDATE ingestion_jobs SET status='PENDING',error=NULL,attempts=0,lease_token=NULL,updated_at=now() WHERE version_id=$1 AND status='FAILED' RETURNING version_id",[id]);
      if(!updated.rowCount) throw Object.assign(new Error('Job não pode ser reprocessado'),{statusCode:409});
      await c.query("UPDATE document_versions SET index_status='PENDING' WHERE id=$1",[id]);
      await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'KNOWLEDGE_REINDEX_REQUESTED',$2)",[a.id,id]);
   });
   return {ok:true};
 });
 app.post('/knowledge/versions/:id/submit-review',async(req,reply)=>{
   const a=await requireActor(req);
   const id=(req.params as {id:string}).id;
   const state=await transaction(async c=>{
     await requireCurrentActor(c,a);
     const r=await c.query(`SELECT v.id,v.authored_by,v.status,d.archived_at,s.visibility,g.can_read,g.can_edit
       FROM document_versions v JOIN documents d ON d.id=v.document_id
       JOIN spaces s ON s.id=d.space_id
       LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$2
       WHERE v.id=$1 FOR UPDATE OF v`,[id,a.id]);
     const version=r.rows[0];
     if(!version||version.authored_by!==a.id)return 'NOT_FOUND';
     if(!(version.can_edit && (version.visibility==='SHARED'||version.can_read)))return 'FORBIDDEN';
     if(version.archived_at||version.status!=='DRAFT')return 'CONFLICT';
     await c.query("UPDATE document_versions SET status='IN_REVIEW' WHERE id=$1",[id]);
     await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'KNOWLEDGE_SUBMITTED_REVIEW',$2)",[a.id,id]);
     return 'OK';
   });
   if(state==='NOT_FOUND')return reply.code(404).send({error:'Rascunho não encontrado'});
   if(state==='FORBIDDEN')return reply.code(403).send({error:'Permissão de edição revogada'});
   if(state==='CONFLICT')return reply.code(409).send({error:'Estado inválido'});
   return {ok:true};
 });
 app.post('/knowledge/versions/:id/publish',async(req,reply)=>{
   const a=await requireActor(req);
   const id=(req.params as {id:string}).id;
   const b=req.body as {confirm?:unknown}|undefined;
   if(b?.confirm!==true) return reply.code(400).send({error:'Confirmação humana obrigatória'});
   const outcome=await transaction(async c=>{
     await requireCurrentActor(c,a);
     const r=await c.query(`SELECT v.*,d.space_id,d.current_version_id,d.archived_at,s.visibility,g.can_read,g.can_approve
        FROM document_versions v JOIN documents d ON d.id=v.document_id JOIN spaces s ON s.id=d.space_id
        LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$2 WHERE v.id=$1 FOR UPDATE OF v,d`,[id,a.id]);
     const v=r.rows[0];
     if(!v) return 'NOT_FOUND';
     if(!canApprove(a.role,v.visibility,v)) return 'FORBIDDEN';
     if(v.archived_at)return 'ARCHIVED';
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
   if(outcome==='ARCHIVED') return reply.code(409).send({error:'Documento arquivado. Restaure-o antes de publicar outra versão'});
   return {ok:true};
 });

 // Requesting corrections preserves the reviewed version and never edits the published one.
 app.post('/knowledge/versions/:id/request-changes',async(req,reply)=>{
   const actor=await requireActor(req);
   const id=(req.params as {id:string}).id;
   const b=req.body as {note?:unknown}|undefined;
   const note=typeof b?.note==='string'?b.note.trim():'';
   if(note.length<10||note.length>2000||hasSecrets(note))
     return reply.code(400).send({error:'Justificativa obrigatória (10 a 2.000 caracteres, sem credenciais)'});
   const state=await transaction(async c=>{
     await requireCurrentActor(c,actor);
     const r=await c.query('SELECT v.document_id,v.status,s.visibility,g.can_read,g.can_approve FROM document_versions v '+
       'JOIN documents d ON d.id=v.document_id JOIN spaces s ON s.id=d.space_id '+
       'LEFT JOIN space_grants g ON g.user_id=$2 AND g.space_id=s.id '+
       'WHERE v.id=$1 FOR UPDATE OF v,d',[id,actor.id]);
     const item=r.rows[0];
     if(!item)return 'NOT_FOUND';
     if(!canApprove(actor.role,item.visibility,item))return 'FORBIDDEN';
     if(item.status!=='IN_REVIEW')return 'CONFLICT';
     await c.query("UPDATE document_versions SET status='CHANGES_REQUESTED',reviewed_by=$2,reviewed_at=now(),review_note=$3 WHERE id=$1",[id,actor.id,note]);
     await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'KNOWLEDGE_CHANGES_REQUESTED',$2)",[actor.id,item.document_id]);
     return 'OK';
   });
   if(state==='NOT_FOUND')return reply.code(404).send({error:'Versão não encontrada'});
   if(state==='FORBIDDEN')return reply.code(403).send({error:'Aprovação não autorizada'});
   if(state==='CONFLICT')return reply.code(409).send({error:'A versão não está em revisão'});
   return {ok:true};
 });
 // A correction is an immutable new draft. Lock both rows for concurrent requests.
 app.post('/knowledge/versions/:id/correct',async(req,reply)=>{
   const actor=await requireActor(req);
   const id=(req.params as {id:string}).id;
   const b=req.body as {content?:unknown}|undefined;
   const content=typeof b?.content==='string'?b.content.trim():'';
   if(content.length<20||content.length>100000||hasInfrastructureSecrets(content))
     return reply.code(400).send({error:'Artigo corrigido inválido ou contém possível credencial'});
   const result=await transaction(async c=>{
     await requireCurrentActor(c,actor);
     const r=await c.query('SELECT v.id,v.document_id,v.authored_by,v.status,v.superseded_by,v.base_version_id,'+
       'd.space_id,d.kind,d.current_version_id,d.archived_at FROM document_versions v '+
       'JOIN documents d ON d.id=v.document_id WHERE v.id=$1 FOR UPDATE OF v,d',[id]);
     const ver=r.rows[0];
     if(!ver||ver.authored_by!==actor.id||ver.archived_at)return {error:'NOT_FOUND'};
     const perm=await c.query('SELECT s.visibility,g.can_read,g.can_edit FROM spaces s '+
       'LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$2 WHERE s.id=$1',[ver.space_id,actor.id]);
     const p=perm.rows[0];
     if(!(p && (p.can_edit && (p.visibility==='SHARED'||p.can_read))))return {error:'FORBIDDEN'};
     if(ver.kind!=='ARTICLE')return {error:'UNSUPPORTED'};
     if(ver.status!=='CHANGES_REQUESTED'||ver.superseded_by)return {error:'CONFLICT'};
     if(ver.current_version_id!==ver.base_version_id)return {error:'STALE'};
     const next=await c.query('SELECT COALESCE(MAX(version_number),0)+1 AS number FROM document_versions WHERE document_id=$1',[ver.document_id]);
     const created=await c.query("INSERT INTO document_versions(document_id,version_number,status,content,authored_by,base_version_id) VALUES($1,$2,'DRAFT',$3,$4,$5) RETURNING id",
       [ver.document_id,Number(next.rows[0].number),content,actor.id,ver.base_version_id]);
     await c.query('UPDATE document_versions SET superseded_by=$2 WHERE id=$1',[id,created.rows[0].id]);
     await c.query('INSERT INTO ingestion_jobs(version_id) VALUES($1)',[created.rows[0].id]);
     await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'KNOWLEDGE_CORRECTION_DRAFT_CREATED',$2)",[actor.id,ver.document_id]);
     return {documentId:ver.document_id,versionId:created.rows[0].id};
   });
   if('error' in result){
     if(result.error==='NOT_FOUND')return reply.code(404).send({error:'Proposta não encontrada'});
     if(result.error==='FORBIDDEN')return reply.code(403).send({error:'Permissão de edição revogada'});
     if(result.error==='UNSUPPORTED')return reply.code(415).send({error:'Reenvie um PDF corrigido como novo documento'});
     return reply.code(409).send({error:result.error==='STALE'?'O artigo publicado mudou. Reabra a revisão':'A proposta já foi corrigida ou não está aguardando ajustes'});
   }
   return reply.code(201).send(result);
 });
 // PDF corrections replace the bytes in a new draft, never in an approved version.
 app.post('/knowledge/versions/:id/correct-pdf',async(req,reply)=>{
   const actor=await requireActor(req);
   const id=(req.params as {id:string}).id;
   const preflight=await query('SELECT v.authored_by,v.status,v.superseded_by,d.kind,d.space_id,d.archived_at '+
     'FROM document_versions v JOIN documents d ON d.id=v.document_id WHERE v.id=$1',[id]);
   const check=preflight.rows[0];
   if(!check||check.authored_by!==actor.id||check.archived_at)
     return reply.code(404).send({error:'Proposta não encontrada'});
   const authorized=await spacePermission(actor,check.space_id);
   if(!authorized?.edit)return reply.code(403).send({error:'Permissão de edição revogada'});
   if(check.kind!=='PDF')return reply.code(415).send({error:'Esta proposta não é um PDF'});
   if(check.status!=='CHANGES_REQUESTED'||check.superseded_by)
     return reply.code(409).send({error:'A proposta não está aguardando correções'});
   const file=await req.file({limits:{fileSize:8*1024*1024,files:1}});
   const bytes=await readPdfBytes(file);
   const result=await transaction(async c=>{
     await requireCurrentActor(c,actor);
     const r=await c.query('SELECT v.id,v.document_id,v.authored_by,v.status,v.superseded_by,v.base_version_id,'+
       'd.space_id,d.kind,d.current_version_id,d.archived_at FROM document_versions v '+
       'JOIN documents d ON d.id=v.document_id WHERE v.id=$1 FOR UPDATE OF v,d',[id]);
     const ver=r.rows[0];
     if(!ver||ver.authored_by!==actor.id||ver.archived_at)return {error:'NOT_FOUND'};
     const perm=await c.query('SELECT s.visibility,g.can_read,g.can_edit FROM spaces s '+
       'LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$2 WHERE s.id=$1',[ver.space_id,actor.id]);
     const p=perm.rows[0];
     if(!(p && (p.can_edit && (p.visibility==='SHARED'||p.can_read))))return {error:'FORBIDDEN'};
     if(ver.kind!=='PDF')return {error:'UNSUPPORTED'};
     if(ver.status!=='CHANGES_REQUESTED'||ver.superseded_by)return {error:'CONFLICT'};
     if(ver.current_version_id!==ver.base_version_id)return {error:'STALE'};
     const next=await c.query('SELECT COALESCE(MAX(version_number),0)+1 AS number '+
       'FROM document_versions WHERE document_id=$1',[ver.document_id]);
     const draft=await c.query("INSERT INTO document_versions(document_id,version_number,status,content,pdf_bytes,authored_by,base_version_id) "+
       "VALUES($1,$2,'DRAFT','',$3,$4,$5) RETURNING id",
       [ver.document_id,Number(next.rows[0].number),bytes,actor.id,ver.base_version_id]);
     await c.query('UPDATE document_versions SET superseded_by=$2 WHERE id=$1',[id,draft.rows[0].id]);
     await c.query('INSERT INTO ingestion_jobs(version_id) VALUES($1)',[draft.rows[0].id]);
     await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'KNOWLEDGE_PDF_CORRECTION_DRAFT_CREATED',$2)",
       [actor.id,ver.document_id]);
     return {documentId:ver.document_id,versionId:draft.rows[0].id};
   });
   if('error' in result){
     if(result.error==='NOT_FOUND')return reply.code(404).send({error:'Proposta não encontrada'});
     if(result.error==='FORBIDDEN')return reply.code(403).send({error:'Permissão de edição revogada'});
     if(result.error==='UNSUPPORTED')return reply.code(415).send({error:'A proposta não é um PDF'});
     return reply.code(409).send({error:result.error==='STALE'
       ? 'O documento publicado mudou; crie uma nova revisão'
       : 'A proposta já foi corrigida ou não está aguardando ajustes'});
   }
   return reply.code(201).send(result);
 });
 app.post('/knowledge/versions/:id/reject',async(req,reply)=>{
   const actor=await requireActor(req);
   const id=(req.params as {id:string}).id;
   const b=req.body as {note?:unknown}|undefined;
   const note=typeof b?.note==='string'?b.note.trim():'';
   if(note.length<10||note.length>2000||hasSecrets(note))
     return reply.code(400).send({error:'Informe a justificativa (10 a 2.000 caracteres, sem credenciais)'});
   const state=await transaction(async c=>{
     await requireCurrentActor(c,actor);
     const r=await c.query('SELECT v.status,v.document_id,s.visibility,g.can_read,g.can_approve FROM document_versions v '+
       'JOIN documents d ON d.id=v.document_id JOIN spaces s ON s.id=d.space_id '+
       'LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$2 '+
       'WHERE v.id=$1 FOR UPDATE OF v,d',[id,actor.id]);
     const ver=r.rows[0];
     if(!ver)return 'NOT_FOUND';
     if(!canApprove(actor.role,ver.visibility,ver))return 'FORBIDDEN';
     if(ver.status!=='IN_REVIEW')return 'CONFLICT';
     await c.query("UPDATE document_versions SET status='REJECTED',review_note=$3,reviewed_by=$2,reviewed_at=now() WHERE id=$1",[id,actor.id,note]);
     await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'KNOWLEDGE_REJECTED',$2)",[actor.id,ver.document_id]);
     return 'OK';
   });
   if(state==='NOT_FOUND')return reply.code(404).send({error:'Versão não encontrada'});
   if(state==='FORBIDDEN')return reply.code(403).send({error:'Aprovação não autorizada'});
   if(state==='CONFLICT')return reply.code(409).send({error:'A versão não está em revisão'});
   return {ok:true};
 });
 app.post('/knowledge/pending/:id/confirm',async(req,reply)=>{
   const a=await requireActor(req);
   const id=(req.params as {id:string}).id;
   const body=req.body as {duplicateReason?:unknown}|undefined;
   const duplicateReason=typeof body?.duplicateReason==='string'?body.duplicateReason.trim():undefined;
   if(duplicateReason && hasSecrets(duplicateReason))return reply.code(422).send({error:'Remova credenciais da justificativa'});
   const result=await transaction(async c=>{
     await requireCurrentActor(c,a);
     const r=await c.query('SELECT * FROM pending_actions WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,a.id]);
     const pending=r.rows[0];
     if(!pending) return {error:'NOT_FOUND'};
     if(pending.result_version_id) return {documentId:pending.document_id,versionId:pending.result_version_id};
     if(pending.expires_at<=new Date()) return {error:'EXPIRED'};
     const p=await spacePermission(a,pending.space_id);
     if(!p?.edit) return {error:'FORBIDDEN'};
     if(hasSecrets(pending.title)||hasInfrastructureSecrets(pending.content)) return {error:'SECRETS'};
     let docId=pending.document_id;let version=1;
     let similarCount=0;
     if(docId){
       const old=await c.query('SELECT current_version_id,archived_at FROM documents WHERE id=$1 FOR UPDATE',[docId]);
       if(!old.rowCount||old.rows[0].archived_at||old.rows[0].current_version_id!==pending.base_version_id) return {error:'STALE'};
       const count=await c.query('SELECT COALESCE(MAX(version_number),0)+1 AS next FROM document_versions WHERE document_id=$1',[docId]);
       version=Number(count.rows[0].next);
     } else {
       if(!p.read)return {error:'FORBIDDEN'};
       await c.query('SELECT id FROM spaces WHERE id=$1 FOR UPDATE',[pending.space_id]);
       const matches=await findSimilarPublished(pending.space_id,pending.title,c,pending.content);
       similarCount=matches.length;
       if(matches.length && !validDuplicateReason(duplicateReason)) return {error:'SIMILAR_ARTICLES',matches};
       const doc=await c.query("INSERT INTO documents(space_id,title,kind) VALUES($1,$2,'ARTICLE') RETURNING id",[pending.space_id,pending.title]);
       docId=doc.rows[0].id;
     }
     const v=await c.query("INSERT INTO document_versions(document_id,version_number,status,content,authored_by,base_version_id) VALUES($1,$2,'DRAFT',$3,$4,$5) RETURNING id",[docId,version,pending.content,a.id,pending.base_version_id]);
     await c.query('INSERT INTO ingestion_jobs(version_id) VALUES($1)',[v.rows[0].id]);
     if(!pending.document_id && similarCount>0 && validDuplicateReason(duplicateReason)){
       await c.query("INSERT INTO audit_events(actor_id,action,resource_id,metadata) VALUES($1,'KNOWLEDGE_DUPLICATE_ACKNOWLEDGED',$2,$3::jsonb)",
         [a.id,docId,JSON.stringify({reason:duplicateReason})]);
     }
     await c.query('UPDATE pending_actions SET result_version_id=$2,document_id=$3,confirmed_at=now() WHERE id=$1',[id,v.rows[0].id,docId]);
     await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'KNOWLEDGE_DRAFT_CREATED',$2)",[a.id,docId]);
     return {documentId:docId,versionId:v.rows[0].id};
   });
   if('error' in result){
     if(result.error==='SIMILAR_ARTICLES' && 'matches' in result)return reply.code(409).send({error:'Há artigos semelhantes. Abra o existente ou justifique a criação de outro.',code:'SIMILAR_ARTICLES',matches:result.matches});
     return reply.code(result.error==='FORBIDDEN'?403:result.error==='NOT_FOUND'?404:result.error==='SECRETS'?422:409).send({error:result.error});
   }
   return result;
 });
 app.post('/feedback',async(req,reply)=>{
   const actor=await requireActor(req);
   const body=req.body as {messageId?:unknown;rating?:unknown;comment?:unknown}|undefined;
   if(typeof body?.messageId!=='string'||!(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).test(body.messageId)||!['GOOD','BAD'].includes(String(body.rating))
     ||(body.comment!==undefined && body.comment!==null && typeof body.comment!=='string'))
     return reply.code(400).send({error:'Feedback inválido'});
   const comment=typeof body.comment==='string'?body.comment.trim():null;
   if(comment && comment.length>1000)
     return reply.code(400).send({error:'Comentário excede 1.000 caracteres'});
   if(comment && hasSecrets(comment))
     return reply.code(422).send({error:'Possível credencial detectada no comentário'});
   const result=await transaction(async c=>{
     // Locking the assistant message serializes retries and concurrent ratings.
     const message=await c.query('SELECT m.id FROM messages m JOIN conversations x ON x.id=m.conversation_id '+
       "WHERE m.id=$1 AND x.user_id=$2 AND m.auth_revision=$3 AND m.role='assistant' FOR UPDATE OF m",
       [body.messageId,actor.id,actor.auth_revision]);
     if(!message.rowCount)return {error:'NOT_FOUND'} as const;
     const account=await c.query('SELECT auth_revision,active FROM users WHERE id=$1 FOR SHARE',[actor.id]);
     if(!account.rowCount||!account.rows[0].active||account.rows[0].auth_revision!==actor.auth_revision)
       return {error:'REVOKED'} as const;
     const previous=await c.query('SELECT id FROM feedback WHERE user_id=$1 AND message_id=$2 '+
       'ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE',[actor.id,body.messageId]);
     if(previous.rowCount){
       await c.query('UPDATE feedback SET rating=$2,comment=$3 WHERE id=$1',
         [previous.rows[0].id,body.rating,comment]);
     }else{
       await c.query('INSERT INTO feedback(user_id,message_id,rating,comment) VALUES($1,$2,$3,$4)',
         [actor.id,body.messageId,body.rating,comment]);
     }
     await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'ASSISTANT_FEEDBACK_SAVED',$2)",
       [actor.id,body.messageId]);
     return {ok:true,rating:body.rating,comment};
   });
   if('error' in result)return reply.code(result.error==='REVOKED'?403:404).send({
     error:result.error==='REVOKED'?'Sessão ou permissões alteradas':'Mensagem do agente não encontrada'
   });
   return result;
 });

}
