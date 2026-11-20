import type { FastifyInstance, FastifyRequest } from 'fastify';
import argon2 from 'argon2';
import { pool, query, transaction, audit } from './db.js';
import { actorForSession, token, hashToken, type Actor } from './security.js';
export const COOKIE = 'suportai_session';
const isProd = process.env.NODE_ENV==='production';
function setCookie(reply:any,raw:string) { reply.setCookie(COOKIE,raw,{httpOnly:true,secure:isProd,sameSite:'strict',path:'/',maxAge:60*60*8}); }
export async function requireActor(req:FastifyRequest):Promise<Actor> {
 const a=await actorForSession(req.cookies?.[COOKIE]);
 if(!a) throw Object.assign(new Error('Não autenticado'),{statusCode:401});
 if(a.must_change_password && req.url!=='/auth/change-password' && req.url!=='/auth/logout' && req.url!=='/auth/me')
   throw Object.assign(new Error('Troca de senha obrigatória'),{statusCode:403});
 return a;
}
export function requireAdmin(actor:Actor) {
 if(actor.role!=='ADMIN') throw Object.assign(new Error('Acesso negado'),{statusCode:403});
}
export function validEmail(v:unknown):v is string {return typeof v==='string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length<=254;}
function strongPassword(v:unknown):v is string {return typeof v==='string'&&v.length>=12&&v.length<=256;}
async function resetTokenFor(userId:string,adminId:string) {
 const raw=token();
 await transaction(async c=>{
   await c.query('UPDATE users SET must_change_password=true,auth_revision=auth_revision+1 WHERE id=$1',[userId]);
   await c.query('DELETE FROM sessions WHERE user_id=$1',[userId]);
   await c.query('DELETE FROM password_resets WHERE user_id=$1',[userId]);
   await c.query("INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '15 minutes')",[hashToken(raw),userId]);
   await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'PASSWORD_RESET_STARTED',$2)",[adminId,userId]);
 });
 return raw;
}
export function registerAuth(app:FastifyInstance) {
 const attempts=new Map<string,{count:number,until:number}>();
 app.post('/auth/login',async(req,reply)=>{
   const ip=req.ip;
   let rate=attempts.get(ip);
   if(rate && rate.until>Date.now() && rate.count>=8) return reply.code(429).send({error:'Muitas tentativas; tente mais tarde'});
   const body=req.body as {email?:unknown;password?:unknown}|undefined;
   if(!validEmail(body?.email)||typeof body?.password!=='string') return reply.code(400).send({error:'Credenciais inválidas'});
   const r=await query('SELECT id,email,password_hash,active,must_change_password,role FROM users WHERE email=$1',[body.email.toLowerCase()]);
   const user=r.rows[0];
   const ok=user?.active && await argon2.verify(user.password_hash,body.password).catch(()=>false);
   if(!ok) {
     const prev=rate && rate.until>Date.now()?rate.count:0;
     attempts.set(ip,{count:prev+1,until:Date.now()+15*60*1000});
     return reply.code(401).send({error:'Credenciais inválidas'});
   }
   attempts.delete(ip);
   const raw=token();
   await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",[hashToken(raw),user.id]);
   setCookie(reply,raw);
   return {user:{id:user.id,email:user.email,role:user.role,mustChangePassword:user.must_change_password}};
 });
 app.get('/auth/me',async(req,reply)=> {
   const a=await requireActor(req);
   const r=await query('SELECT email FROM users WHERE id=$1',[a.id]);
   return {id:a.id,email:r.rows[0]?.email,role:a.role,mustChangePassword:a.must_change_password};
 });
 app.post('/auth/logout',async(req,reply)=>{
   const raw=req.cookies?.[COOKIE];
   if(raw) await query('DELETE FROM sessions WHERE token_hash=$1',[hashToken(raw)]);
   reply.clearCookie(COOKIE,{path:'/'});
   return {ok:true};
 });
 app.post('/auth/change-password',async(req,reply)=>{
   const b=req.body as {resetToken?:unknown;newPassword?:unknown}|undefined;
   if(!strongPassword(b?.newPassword)) return reply.code(400).send({error:'Senha deve ter 12 a 256 caracteres'});
   const reset=typeof b?.resetToken==='string'?b.resetToken:'';
   const existing=await query('SELECT user_id FROM password_resets WHERE token_hash=$1 AND expires_at>now() AND used_at IS NULL',[hashToken(reset)]);
   const sessionActor=await actorForSession(req.cookies?.[COOKIE]);
   const userId=existing.rows[0]?.user_id??(sessionActor?.must_change_password?sessionActor.id:null);
   if(!userId) return reply.code(401).send({error:'Credencial temporária inválida'});
   const hashed=await argon2.hash(b.newPassword);
   await transaction(async c=>{
     const lock=await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
     if(!lock.rowCount) throw Object.assign(new Error('Conta inválida'),{statusCode:401});
     if(reset){
       const consume=await c.query("UPDATE password_resets SET used_at=now() WHERE token_hash=$1 AND user_id=$2 AND used_at IS NULL AND expires_at>now() RETURNING user_id",[hashToken(reset),userId]);
       if(!consume.rowCount) throw Object.assign(new Error('Credencial temporária expirada'),{statusCode:401});
     }
     await c.query('UPDATE users SET password_hash=$2,must_change_password=false,auth_revision=auth_revision+1 WHERE id=$1',[userId,hashed]);
     await c.query('DELETE FROM sessions WHERE user_id=$1',[userId]);
     await c.query('DELETE FROM password_resets WHERE user_id=$1',[userId]);
     await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'PASSWORD_CHANGED',$1)",[userId]);
   });
   const raw=token();
   await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",[hashToken(raw),userId]);
   setCookie(reply,raw);
   return {ok:true};
 });
 app.get('/admin/users',async req=>{
   const a=await requireActor(req);requireAdmin(a);
   const r=await query('SELECT id,email,role,active,must_change_password FROM users ORDER BY created_at DESC LIMIT 200');
   return {users:r.rows};
 });
 app.post('/admin/users',async(req,reply)=>{
   const a=await requireActor(req);requireAdmin(a);
   const b=req.body as {email?:unknown;role?:unknown}|undefined;
   if(!validEmail(b?.email)||!['USER','APPROVER','ADMIN'].includes(String(b?.role))) return reply.code(400).send({error:'Usuário inválido'});
   const password=await argon2.hash(token());
   const r=await query('INSERT INTO users(email,password_hash,role,must_change_password) VALUES($1,$2,$3,true) RETURNING id',[b.email.toLowerCase(),password,b.role]);
   const resetToken=await resetTokenFor(r.rows[0].id,a.id);
   await audit(a.id,'USER_CREATED',r.rows[0].id);
   return reply.code(201).send({id:r.rows[0].id,resetToken,expiresInMinutes:15});
 });
 app.post('/admin/users/:id/reset-password',async(req,reply)=>{
   const a=await requireActor(req);requireAdmin(a);
   const id=(req.params as {id:string}).id;
   const exists=await query('SELECT id FROM users WHERE id=$1',[id]);
   if(!exists.rowCount) return reply.code(404).send({error:'Usuário não encontrado'});
   const resetToken=await resetTokenFor(id,a.id);
   return {resetToken,expiresInMinutes:15};
 });
 app.patch('/admin/users/:id',async(req,reply)=>{
   const a=await requireActor(req);requireAdmin(a);
   const id=(req.params as {id:string}).id;
   const b=req.body as {active?:unknown;role?:unknown}|undefined;
   if(id===a.id) return reply.code(400).send({error:'Não altere seu próprio perfil por esta operação'});
   if(typeof b?.active!=='boolean' && !['USER','APPROVER','ADMIN'].includes(String(b?.role))) return reply.code(400).send({error:'Alteração inválida'});
   const result=await transaction(async c=>{
     const r=await c.query('UPDATE users SET active=COALESCE($2,active),role=COALESCE($3,role),auth_revision=auth_revision+1 WHERE id=$1 RETURNING id',[id,typeof b?.active==='boolean'?b.active:null,['USER','APPROVER','ADMIN'].includes(String(b?.role))?b?.role:null]);
     if(r.rowCount) {
       await c.query('DELETE FROM sessions WHERE user_id=$1',[id]);
       await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'USER_UPDATED',$2)",[a.id,id]);
     }
     return r.rowCount;
   });
   return result?{ok:true}:reply.code(404).send({error:'Usuário não encontrado'});
 });
 app.post('/admin/spaces/:id/grants',async(req,reply)=>{
   const a=await requireActor(req);requireAdmin(a);
   const spaceId=(req.params as {id:string}).id;
   const b=req.body as {userId?:unknown;read?:unknown;edit?:unknown;approve?:unknown}|undefined;
   if(typeof b?.userId!=='string'||typeof b.read!=='boolean'||typeof b.edit!=='boolean'||typeof b.approve!=='boolean'||((b.edit||b.approve)&&!b.read)) return reply.code(400).send({error:'Permissões inválidas: edição e aprovação exigem leitura'});
   await transaction(async c=>{
     await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[b.userId]);
     await c.query(`INSERT INTO space_grants(user_id,space_id,can_read,can_edit,can_approve) VALUES($1,$2,$3,$4,$5)
       ON CONFLICT (user_id,space_id) DO UPDATE SET can_read=$3,can_edit=$4,can_approve=$5`,[b.userId,spaceId,b.read,b.edit,b.approve]);
     await c.query('UPDATE users SET auth_revision=auth_revision+1 WHERE id=$1',[b.userId]);
     await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'PERMISSIONS_UPDATED',$2)",[a.id,spaceId]);
   });
   return {ok:true};
 });
 app.get('/spaces',async req=>{
   const a=await requireActor(req);
   const r=await query(`SELECT s.id,s.name,s.visibility,
   (s.visibility='SHARED' OR COALESCE(g.can_read,false)) AS can_read,
   ((s.visibility='SHARED' OR COALESCE(g.can_read,false)) AND COALESCE(g.can_edit,false)) AS can_edit,
   ($2='APPROVER' AND (s.visibility='SHARED' OR COALESCE(g.can_read,false)) AND COALESCE(g.can_approve,false)) AS can_approve
   FROM spaces s LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$1
   WHERE s.visibility='SHARED' OR COALESCE(g.can_read,false) OR $2='ADMIN'
   ORDER BY name`,[a.id,a.role]);
   return {spaces:r.rows};
 });
}
