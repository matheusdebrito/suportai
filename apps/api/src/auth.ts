import type { FastifyInstance, FastifyRequest } from 'fastify';
import argon2 from 'argon2';
import { query, transaction } from './db.js';
import { actorForSession, requireCurrentActor, token, hashToken, type Actor } from './security.js';
export const COOKIE = 'suportai_session';
const isProd = process.env.NODE_ENV==='production';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const departmentName=(name:unknown):string|null=>{
 if(typeof name!=='string')return null;
 const value=name.trim().replace(/\s+/g,' ');
 return value.length>=3&&value.length<=80?value:null;
};
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
async function resetTokenFor(userId:string,admin:Actor):Promise<string|null> {
 const raw=token();
 // Invalidate the previous password immediately. A reset token, not a stale
 // password, must be the only way to regain access after an admin reset.
 const unusablePassword=await argon2.hash(token());
 const eligible=await transaction(async c=>{
   await requireCurrentActor(c,admin);
   const account=await c.query('SELECT active FROM users WHERE id=$1 FOR UPDATE',[userId]);
   if(!account.rowCount||!account.rows[0].active)return false;
   await c.query('UPDATE users SET password_hash=$2,must_change_password=true,auth_revision=auth_revision+1 WHERE id=$1',[userId,unusablePassword]);
   await c.query('DELETE FROM sessions WHERE user_id=$1',[userId]);
   await c.query('DELETE FROM password_resets WHERE user_id=$1',[userId]);
   await c.query("INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '15 minutes')",[hashToken(raw),userId]);
   await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'PASSWORD_RESET_STARTED',$2)",[admin.id,userId]);
   return true;
 });
 return eligible?raw:null;
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
   const ok=user?.active && !user.must_change_password &&
     await argon2.verify(user.password_hash,body.password).catch(()=>false);
   if(!ok) {
     const prev=rate && rate.until>Date.now()?rate.count:0;
     attempts.set(ip,{count:prev+1,until:Date.now()+15*60*1000});
     return reply.code(401).send({error:'Credenciais inválidas'});
   }
   const raw=token();
   // Recheck after hashing while holding the account lock, so an admin reset
   // cannot race with session creation using the previous password.
   const current=await transaction(async c=>{
     const locked=await c.query('SELECT active,must_change_password,email,role FROM users WHERE id=$1 FOR SHARE',[user.id]);
     const account=locked.rows[0];
     if(!account?.active||account.must_change_password)return null;
     await c.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",[hashToken(raw),user.id]);
     return account;
   });
   if(!current)return reply.code(401).send({error:'Credenciais inválidas'});
   attempts.delete(ip);
   setCookie(reply,raw);
   return {user:{id:user.id,email:current.email,role:current.role,mustChangePassword:false}};
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
   // Password recovery is exclusively token-based; a stale session (or an old
   // password) must not override a reset initiated by an administrator.
   const userId=existing.rows[0]?.user_id;
   if(!userId) return reply.code(401).send({error:'Credencial temporária inválida'});
   const hashed=await argon2.hash(b.newPassword);
   const raw=token();
   await transaction(async c=>{
     const lock=await c.query('SELECT active,must_change_password FROM users WHERE id=$1 FOR UPDATE',[userId]);
     if(!lock.rows[0]?.active||!lock.rows[0].must_change_password)
       throw Object.assign(new Error('Conta inválida'),{statusCode:401});
     const consume=await c.query("UPDATE password_resets SET used_at=now() WHERE token_hash=$1 AND user_id=$2 AND used_at IS NULL AND expires_at>now() RETURNING user_id",[hashToken(reset),userId]);
     if(!consume.rowCount) throw Object.assign(new Error('Credencial temporária expirada'),{statusCode:401});
     await c.query('UPDATE users SET password_hash=$2,must_change_password=false,auth_revision=auth_revision+1 WHERE id=$1',[userId,hashed]);
     await c.query('DELETE FROM sessions WHERE user_id=$1',[userId]);
     await c.query('DELETE FROM password_resets WHERE user_id=$1',[userId]);
     await c.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",[hashToken(raw),userId]);
     await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'PASSWORD_CHANGED',$1)",[userId]);
   });
   setCookie(reply,raw);
   return {ok:true};
 });
 app.get('/admin/departments',async req=>{
   const admin=await requireActor(req);requireAdmin(admin);
   const result=await transaction(async c=>{
     await requireCurrentActor(c,admin);
     return c.query(`SELECT d.id,d.name,d.active,
       (SELECT count(*)::int FROM user_departments ud WHERE ud.department_id=d.id) AS members
       FROM departments d ORDER BY lower(d.name),d.id`);
   });
   return {departments:result.rows};
 });
 app.post('/admin/departments',async(req,reply)=>{
   const admin=await requireActor(req);requireAdmin(admin);
   const name=departmentName((req.body as {name?:unknown}|undefined)?.name);
   if(!name)return reply.code(400).send({error:'Nome do departamento inválido'});
   const created=await transaction(async c=>{
     await requireCurrentActor(c,admin);
     const r=await c.query('INSERT INTO departments(name) VALUES($1) ON CONFLICT DO NOTHING RETURNING id,name,active',[name]);
     if(r.rowCount)await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'DEPARTMENT_CREATED',$2)",[admin.id,r.rows[0].id]);
     return r.rows[0]||null;
   });
   return created?reply.code(201).send(created):reply.code(409).send({error:'Departamento já cadastrado'});
 });
 app.patch('/admin/departments/:id',async(req,reply)=>{
   const admin=await requireActor(req);requireAdmin(admin);
   const id=(req.params as {id:string}).id;
   const body=req.body as {name?:unknown;active?:unknown}|undefined;
   if(!uuid.test(id)||!body||!('name' in body)&&!('active' in body)||
      ('name' in body&&!departmentName(body.name))||
      ('active' in body&&typeof body.active!=='boolean'))
     return reply.code(400).send({error:'Alteração de departamento inválida'});
   try{
     const result=await transaction(async c=>{
       await requireCurrentActor(c,admin);
       const r=await c.query('UPDATE departments SET name=COALESCE($2,name),active=COALESCE($3,active) WHERE id=$1 RETURNING id,name,active',
         [id,'name' in body?departmentName(body.name):null,'active' in body?body.active:null]);
       if(r.rowCount)await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'DEPARTMENT_UPDATED',$2)",[admin.id,id]);
       return r.rows[0]||null;
     });
     return result||reply.code(404).send({error:'Departamento não encontrado'});
   }catch(error){
     if((error as {code?:string}).code==='23505')return reply.code(409).send({error:'Departamento já cadastrado'});
     throw error;
   }
 });
 app.put('/admin/users/:id/departments',async(req,reply)=>{
   const admin=await requireActor(req);requireAdmin(admin);
   const id=(req.params as {id:string}).id;
   const ids=(req.body as {departmentIds?:unknown}|undefined)?.departmentIds;
   if(!uuid.test(id)||!Array.isArray(ids)||ids.length>12||
      !ids.every(value=>typeof value==='string'&&uuid.test(value))||
      new Set(ids).size!==ids.length)
     return reply.code(400).send({error:'Vínculos de departamentos inválidos'});
   const outcome=await transaction(async c=>{
     await requireCurrentActor(c,admin);
     const account=await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[id]);
     if(!account.rowCount)return 'NOT_FOUND';
     const existing=await c.query('SELECT department_id FROM user_departments WHERE user_id=$1 ORDER BY department_id',[id]);
     const oldIds=existing.rows.map(row=>row.department_id as string);
     const desired=[...ids].sort();
     if(JSON.stringify(oldIds)===JSON.stringify(desired))return 'OK';
     const allowed=await c.query('SELECT id FROM departments WHERE id=ANY($1::uuid[]) AND active=true FOR SHARE',[desired]);
     if(allowed.rowCount!==desired.length)return 'INVALID_DEPARTMENT';
     await c.query('DELETE FROM user_departments WHERE user_id=$1',[id]);
     for(const departmentId of desired)await c.query('INSERT INTO user_departments(user_id,department_id) VALUES($1,$2)',[id,departmentId]);
     // A department cannot grant READ. Invalidate sessions to remain safe if
     // a future release starts using this membership for further policy.
     await c.query('UPDATE users SET auth_revision=auth_revision+1 WHERE id=$1',[id]);
     await c.query('DELETE FROM sessions WHERE user_id=$1',[id]);
     await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'USER_DEPARTMENTS_UPDATED',$2)",[admin.id,id]);
     return 'OK';
   });
   if(outcome==='NOT_FOUND')return reply.code(404).send({error:'Usuário não encontrado'});
   if(outcome==='INVALID_DEPARTMENT')return reply.code(400).send({error:'Departamento inexistente ou inativo'});
   return {ok:true};
 });
 app.get('/admin/users',async req=>{
   const a=await requireActor(req);requireAdmin(a);
   const users=await transaction(async c=>{
     await requireCurrentActor(c,a);
     const r=await c.query(`SELECT u.id,u.email,u.role,u.active,u.must_change_password,
       (SELECT COALESCE(array_agg(ud.department_id ORDER BY ud.department_id),'{}'::uuid[])
        FROM user_departments ud WHERE ud.user_id=u.id) AS department_ids
       FROM users u ORDER BY u.created_at DESC LIMIT 200`);
     return r.rows;
   });
   return {users};
 });
 app.post('/admin/users',async(req,reply)=>{
   const a=await requireActor(req);requireAdmin(a);
   const b=req.body as {email?:unknown;role?:unknown}|undefined;
   if(!validEmail(b?.email)||!['USER','APPROVER','ADMIN'].includes(String(b?.role))) return reply.code(400).send({error:'Usuário inválido'});
   const email=(b.email as string).toLowerCase();
   const password=await argon2.hash(token());
   const resetToken=token();
   const newId=await transaction(async c=>{
     await requireCurrentActor(c,a);
     const created=await c.query('INSERT INTO users(email,password_hash,role,must_change_password) VALUES($1,$2,$3,true) ON CONFLICT (email) DO NOTHING RETURNING id',
       [email,password,b.role]);
     if(!created.rowCount)return null;
     const id=created.rows[0].id as string;
     await c.query("INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '15 minutes')",
       [hashToken(resetToken),id]);
     await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'PASSWORD_RESET_STARTED',$2)",[a.id,id]);
     await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'USER_CREATED',$2)",[a.id,id]);
     return id;
   });
   if(!newId)return reply.code(409).send({error:'Já existe uma conta com esse e-mail'});
   return reply.code(201).send({id:newId,resetToken,expiresInMinutes:15});
 });
 app.post('/admin/users/:id/reset-password',async(req,reply)=>{
   const a=await requireActor(req);requireAdmin(a);
   const id=(req.params as {id:string}).id;
   if(id===a.id)return reply.code(400).send({error:'Use a troca de senha da própria conta'});
   const resetToken=await resetTokenFor(id,a);
   if(!resetToken)return reply.code(404).send({error:'Conta não encontrada ou inativa'});
   return {resetToken,expiresInMinutes:15};
 });
 app.patch('/admin/users/:id',async(req,reply)=>{
   const a=await requireActor(req);requireAdmin(a);
   const id=(req.params as {id:string}).id;
   const b=req.body as {active?:unknown;role?:unknown}|undefined;
   if(id===a.id) return reply.code(400).send({error:'Não altere seu próprio perfil por esta operação'});
   if(typeof b?.active!=='boolean' && !['USER','APPROVER','ADMIN'].includes(String(b?.role))) return reply.code(400).send({error:'Alteração inválida'});
   const result=await transaction(async c=>{
     await requireCurrentActor(c,a);
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
   if(typeof b?.userId!=='string'||!(/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i).test(b.userId)||typeof b.read!=='boolean'||typeof b.edit!=='boolean'||typeof b.approve!=='boolean'||((b.edit||b.approve)&&!b.read)) return reply.code(400).send({error:'Permissões inválidas: edição e aprovação exigem leitura'});
   const updated=await transaction(async c=>{
     await requireCurrentActor(c,a);
     const account=await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[b.userId]);
     const space=await c.query('SELECT id FROM spaces WHERE id=$1 FOR SHARE',[spaceId]);
     if(!account.rowCount||!space.rowCount)return false;
     await c.query(`INSERT INTO space_grants(user_id,space_id,can_read,can_edit,can_approve) VALUES($1,$2,$3,$4,$5)
       ON CONFLICT (user_id,space_id) DO UPDATE SET can_read=$3,can_edit=$4,can_approve=$5`,[b.userId,spaceId,b.read,b.edit,b.approve]);
     await c.query('UPDATE users SET auth_revision=auth_revision+1 WHERE id=$1',[b.userId]);
     await c.query("INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'PERMISSIONS_UPDATED',$2)",[a.id,spaceId]);
     return true;
   });
   if(!updated)return reply.code(404).send({error:'Usuário ou espaço não encontrado'});
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
