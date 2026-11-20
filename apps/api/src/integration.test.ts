import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import argon2 from 'argon2';
import {randomUUID} from 'node:crypto';
import {buildApp} from './server.js';
import {pool,query} from './db.js';

if(!process.env.TEST_DATABASE_URL){
  test('integration requires TEST_DATABASE_URL', {skip:'No isolated PostgreSQL test database configured'},()=>{});
}else{
 test('end-to-end permission, ingestion and publication flow',async()=>{
  const app=await buildApp();
  let worker:ReturnType<typeof spawn>|undefined;
  const origin=process.env.APP_ORIGIN||'http://localhost:5173';
  const id=randomUUID().slice(0,8);
  async function createUser(role:'USER'|'ADMIN'|'APPROVER'){
   const email=`test-${id}-${role.toLowerCase()}@example.test`;
   const password=`SecureTestPassword!-${id}`;
   const r=await query('INSERT INTO users(email,password_hash,role) VALUES($1,$2,$3) RETURNING id',[email,await argon2.hash(password),role]);
   const result=await app.inject({method:'POST',url:'/auth/login',payload:{email,password}});
   assert.equal(result.statusCode,200,result.body);
   const cookie=result.headers['set-cookie']?.toString().split(';')[0];
   assert.ok(cookie);
   return {id:r.rows[0].id,cookie,email,password};
  }
  function auth(cookie:string){return {cookie,origin};}
  try {
   const reader=await createUser('USER');
   const reviewer=await createUser('APPROVER');
   const admin=await createUser('ADMIN');
   const spaces=await app.inject({method:'GET',url:'/spaces',headers:auth(reader.cookie)});
   assert.equal(spaces.statusCode,200);
   const entries=spaces.json().spaces as Array<{id:string;visibility:string}>;
   const shared=entries.find(x=>x.visibility==='SHARED')?.id;
   const restricted=entries.find(x=>x.visibility==='RESTRICTED')?.id;
   assert.ok(shared&&restricted);

   const forbiddenAdmin=await app.inject({method:'POST',url:'/admin/users',headers:auth(reader.cookie),payload:{email:'bad@example.test',role:'ADMIN'}});
   assert.equal(forbiddenAdmin.statusCode,403);

   const sharedDraft=await app.inject({method:'POST',url:'/knowledge/articles',headers:auth(reader.cookie),payload:{spaceId:shared,title:'Procedimento DNS '+id,content:'Para verificar resolução de nomes no Linux utilize dig e confira o servidor DNS autoritativo e o retorno esperado.'}});
   assert.equal(sharedDraft.statusCode,201,sharedDraft.body);
   const sharedDoc=sharedDraft.json() as {documentId:string;versionId:string};
   const earlyReview=await app.inject({method:'POST',url:`/knowledge/versions/${sharedDoc.versionId}/submit-review`,headers:auth(reader.cookie)});
   assert.equal(earlyReview.statusCode,200);
   const earlyPublish=await app.inject({method:'POST',url:`/knowledge/versions/${sharedDoc.versionId}/publish`,headers:auth(reviewer.cookie),payload:{confirm:true}});
   assert.equal(earlyPublish.statusCode,409);

   const unauthorizedPublish=await app.inject({method:'POST',url:`/knowledge/versions/${sharedDoc.versionId}/publish`,headers:auth(admin.cookie),payload:{confirm:true}});
   assert.equal(unauthorizedPublish.statusCode,403);

   worker=spawn(process.execPath,['--import','tsx','src/worker.ts'],{cwd:process.cwd(),env:{...process.env,NODE_ENV:'development'},stdio:'ignore'});
   let indexStatus='PENDING';
   for(let i=0;i<45;i++){
    const r=await query('SELECT index_status FROM document_versions WHERE id=$1',[sharedDoc.versionId]);
    indexStatus=r.rows[0].index_status;
    if(indexStatus==='READY'||indexStatus==='FAILED')break;
    await new Promise(resolve=>setTimeout(resolve,400));
   }
   assert.equal(indexStatus,'READY','Worker must index article before publication');
   const published=await app.inject({method:'POST',url:`/knowledge/versions/${sharedDoc.versionId}/publish`,headers:auth(reviewer.cookie),payload:{confirm:true}});
   assert.equal(published.statusCode,200,published.body);
   const allowedRead=await app.inject({method:'GET',url:`/knowledge/documents/${sharedDoc.documentId}`,headers:auth(reader.cookie)});
   assert.equal(allowedRead.statusCode,200,allowedRead.body);

   const rejectMalformedPdf=await app.inject({method:'POST',url:'/knowledge/articles',headers:auth(reader.cookie),payload:{spaceId:shared,title:'x',content:'short'}});
   assert.equal(rejectMalformedPdf.statusCode,400);

   const restrictedDenied=await app.inject({method:'POST',url:'/knowledge/articles',headers:auth(reader.cookie),payload:{spaceId:restricted,title:'Restrito '+id,content:'Este texto somente deve ser acessado por leitores especificamente autorizados.'}});
   assert.equal(restrictedDenied.statusCode,403);

   await query('INSERT INTO space_grants(user_id,space_id,can_read,can_edit,can_approve) VALUES($1,$2,true,true,true)',[reviewer.id,restricted]);
   const privDraft=await app.inject({method:'POST',url:'/knowledge/articles',headers:auth(reviewer.cookie),payload:{spaceId:restricted,title:'Segredo '+id,content:'Instrução de teste restrito: procedimento interno sobre um servidor de laboratório isolado.'}});
   assert.equal(privDraft.statusCode,201,privDraft.body);
   const privateDoc=privDraft.json() as {documentId:string;versionId:string};
   const leaked=await app.inject({method:'GET',url:`/knowledge/documents/${privateDoc.documentId}`,headers:auth(reader.cookie)});
   assert.equal(leaked.statusCode,404);

   const adminGrant=await app.inject({method:'POST',url:`/admin/spaces/${restricted}/grants`,headers:auth(admin.cookie),payload:{userId:reader.id,read:true,edit:false,approve:false}});
   assert.equal(adminGrant.statusCode,200,adminGrant.body);
   const granted=await app.inject({method:'GET',url:'/spaces',headers:auth(reader.cookie)});
   assert.equal(granted.json().spaces.find((s:any)=>s.id===restricted).can_read,true);
   await app.inject({method:'POST',url:`/admin/spaces/${restricted}/grants`,headers:auth(admin.cookie),payload:{userId:reader.id,read:false,edit:false,approve:false}});
   const revoked=await app.inject({method:'GET',url:'/spaces',headers:auth(reader.cookie)});
   assert.equal(revoked.json().spaces.find((s:any)=>s.id===restricted).can_read,false);

   const badOrigin=await app.inject({method:'POST',url:'/conversations',headers:{cookie:reader.cookie,origin:'https://evil.invalid'}});
   assert.equal(badOrigin.statusCode,403);
  } finally {
   worker?.kill('SIGTERM');
   await app.close();
   await pool.end();
  }
 });
}
