import type {FastifyInstance} from 'fastify';
import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {requireActor,requireAdmin} from './auth.js';
import {transaction} from './db.js';
import {requireCurrentActor} from './security.js';
import {hasSecrets} from './knowledge.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function key(){
 const raw=process.env.OPERATIONAL_CREDENTIAL_KEY||'';
 if(!/^[a-f0-9]{64}$/i.test(raw))throw Object.assign(new Error('Cofre de credenciais não configurado'),{statusCode:503});
 return Buffer.from(raw,'hex');
}
export function sealCredential(value:string,id:string,documentId:string,secret:Buffer){
 const iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',secret,iv);
 cipher.setAAD(Buffer.from(id+':'+documentId));
 const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return {iv,ciphertext,tag:cipher.getAuthTag()};
}
export function openCredential(row:{id:string;document_id:string;iv:Buffer;ciphertext:Buffer;tag:Buffer},secret:Buffer){
 const decipher=createDecipheriv('aes-256-gcm',secret,row.iv);
 decipher.setAAD(Buffer.from(row.id+':'+row.document_id));
 decipher.setAuthTag(row.tag);
 return Buffer.concat([decipher.update(row.ciphertext),decipher.final()]).toString('utf8');
}
const absent=()=>Object.assign(new Error('Credencial ou documento indisponível'),{statusCode:404});
const invalid=()=>Object.assign(new Error('Dados inválidos'),{statusCode:400});
export function registerOperationalCredentials(app:FastifyInstance){
 // All routes share the existing /knowledge proxy and cookie origin enforcement.
 app.get('/knowledge/documents/:id/credentials',async(req,reply)=>{
   reply.header('Cache-Control','no-store');
   const actor=await requireActor(req);const {id}=req.params as {id:string};if(!uuid.test(id))throw absent();
   return transaction(async c=>{
    await requireCurrentActor(c,actor);
    const r=await c.query(`SELECT o.id,o.label FROM operational_credentials o
      JOIN documents d ON d.id=o.document_id JOIN document_versions v ON v.id=d.current_version_id
      JOIN spaces s ON s.id=d.space_id
      LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$2
      LEFT JOIN operational_credential_grants cg ON cg.credential_id=o.id AND cg.user_id=$2
      WHERE d.id=$1 AND d.archived_at IS NULL AND v.status='PUBLISHED' AND v.index_status='READY'
      AND (s.visibility='SHARED' OR COALESCE(g.can_read,false))
      AND ($3='ADMIN' OR cg.user_id IS NOT NULL) ORDER BY o.label LIMIT 50`,[id,actor.id,actor.role]);
    return {credentials:r.rows};
   });
 });
 app.post('/knowledge/documents/:id/credentials',async(req,reply)=>{
   reply.header('Cache-Control','no-store');
   const actor=await requireActor(req);requireAdmin(actor);
   const {id}=req.params as {id:string};if(!uuid.test(id))throw absent();
   const b=req.body as {label?:unknown;value?:unknown}|undefined;
   if(typeof b?.label!=='string'||b.label.trim().length<3||b.label.length>80||hasSecrets(b.label)||
      /[\r\n]/.test(b.label)||typeof b.value!=='string'||!b.value.trim()||b.value.length>512)throw invalid();
   const credentialId=randomUUID(),label=b.label.trim();
   const encrypted=sealCredential(b.value,credentialId,id,key());
   const result=await transaction(async c=>{
    await requireCurrentActor(c,actor);
    const doc=await c.query(`SELECT d.id FROM documents d JOIN document_versions v ON v.id=d.current_version_id
      JOIN spaces s ON s.id=d.space_id LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$2
      WHERE d.id=$1 AND d.archived_at IS NULL AND v.status='PUBLISHED' AND v.index_status='READY'
      AND (s.visibility='SHARED' OR COALESCE(g.can_read,false)) FOR SHARE OF d`,[id,actor.id]);
    if(!doc.rowCount)throw absent();
    const created=await c.query(`INSERT INTO operational_credentials(id,document_id,label,ciphertext,iv,tag,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(document_id,label) DO NOTHING RETURNING id`,
      [credentialId,id,label,encrypted.ciphertext,encrypted.iv,encrypted.tag,actor.id]);
    if(!created.rowCount)return false;
    await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'OPERATIONAL_CREDENTIAL_CREATED',$2)",[actor.id,credentialId]);
    return true;
   });
   return result?reply.code(201).send({id:credentialId,label}):reply.code(409).send({error:'Já existe uma credencial com este nome'});
 });
 app.put('/knowledge/credentials/:id/grants/:userId',async(req,reply)=>{
   reply.header('Cache-Control','no-store');
   const actor=await requireActor(req);requireAdmin(actor);
   const {id,userId}=req.params as {id:string;userId:string};
   const b=req.body as {allowed?:unknown}|undefined;
   if(!uuid.test(id)||!uuid.test(userId)||typeof b?.allowed!=='boolean')throw invalid();
   await transaction(async c=>{
    await requireCurrentActor(c,actor);
    const r=await c.query(`SELECT o.id FROM operational_credentials o JOIN documents d ON d.id=o.document_id
      JOIN spaces s ON s.id=d.space_id LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$2
      WHERE o.id=$1 AND (s.visibility='SHARED' OR COALESCE(g.can_read,false)) AND d.archived_at IS NULL FOR UPDATE OF o`,[id,actor.id]);
    if(!r.rowCount)throw absent();
    const u=await c.query('SELECT id FROM users WHERE id=$1',[userId]);if(!u.rowCount)throw absent();
    if(b.allowed)await c.query('INSERT INTO operational_credential_grants(credential_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,userId]);
    else await c.query('DELETE FROM operational_credential_grants WHERE credential_id=$1 AND user_id=$2',[id,userId]);
    await c.query("INSERT INTO audit_events(actor_id,action,resource_id,metadata) VALUES($1,$2,$3,jsonb_build_object('userId',$4::text))",
      [actor.id,b.allowed?'OPERATIONAL_CREDENTIAL_GRANTED':'OPERATIONAL_CREDENTIAL_REVOKED',id,userId]);
   });
   return {ok:true};
 });
 app.post('/knowledge/credentials/:id/reveal',async(req,reply)=>{
   reply.header('Cache-Control','no-store');
   const actor=await requireActor(req);const {id}=req.params as {id:string};
   if(!uuid.test(id))throw absent();
   if((req.body as {confirm?:unknown}|undefined)?.confirm!==true)throw invalid();
   return transaction(async c=>{
    await requireCurrentActor(c,actor);
    // Lock the credential before checking the grant so revocation and disclosure serialize.
    const lock=await c.query('SELECT id FROM operational_credentials WHERE id=$1 FOR SHARE',[id]);
    if(!lock.rowCount)throw absent();
    const r=await c.query(`SELECT o.id,o.document_id,o.label,o.ciphertext,o.iv,o.tag FROM operational_credentials o
      JOIN documents d ON d.id=o.document_id JOIN document_versions v ON v.id=d.current_version_id
      JOIN spaces s ON s.id=d.space_id LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$2
      JOIN operational_credential_grants cg ON cg.credential_id=o.id AND cg.user_id=$2
      WHERE o.id=$1 AND d.archived_at IS NULL AND v.status='PUBLISHED' AND v.index_status='READY'
      AND (s.visibility='SHARED' OR COALESCE(g.can_read,false)) FOR SHARE OF d`,[id,actor.id]);
    if(!r.rowCount)throw absent();
    const row=r.rows[0];const value=openCredential(row,key());
    await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'OPERATIONAL_CREDENTIAL_REVEALED',$2)",[actor.id,id]);
    return {label:row.label,value};
   });
 });
 app.delete('/knowledge/credentials/:id',async(req,reply)=>{
   reply.header('Cache-Control','no-store');
   const actor=await requireActor(req);requireAdmin(actor);const {id}=req.params as {id:string};
   if(!uuid.test(id)||(req.body as {confirm?:unknown}|undefined)?.confirm!==true)throw invalid();
   await transaction(async c=>{
    await requireCurrentActor(c,actor);
    const r=await c.query(`DELETE FROM operational_credentials o USING documents d,spaces s
      WHERE o.id=$1 AND d.id=o.document_id AND s.id=d.space_id
      AND (s.visibility='SHARED' OR EXISTS(SELECT 1 FROM space_grants g WHERE g.space_id=s.id AND g.user_id=$2 AND g.can_read)) RETURNING o.id`,[id,actor.id]);
    if(!r.rowCount)throw absent();
    await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'OPERATIONAL_CREDENTIAL_DELETED',$2)",[actor.id,id]);
   });
   return {ok:true};
 });
}
