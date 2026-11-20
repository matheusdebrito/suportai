import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import argon2 from 'argon2';
import {randomUUID} from 'node:crypto';
import {buildApp} from './server.js';
import {pool,query} from './db.js';
import {searchKnowledge} from './retrieval.js';
import {actorForSession} from './security.js';
import {respond} from './agent.js';
import type OpenAI from 'openai';
import {PDFDocument,StandardFonts} from 'pdf-lib';

if(!process.env.TEST_DATABASE_URL){
  test('integration requires TEST_DATABASE_URL', {skip:'No isolated PostgreSQL test database configured'},()=>{});
}else{
 if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL) throw new Error('Integration tests require DATABASE_URL to equal TEST_DATABASE_URL');
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

   // An explicit chat request prepares a preview but never publishes anything.
   const proposed=await app.inject({method:'POST',url:'/conversations',headers:auth(reader.cookie)});
   assert.equal(proposed.statusCode,200);
   const conversationId=proposed.json().id as string;
   const editorActor=await actorForSession(reader.cookie.split('=')[1]);
   assert.ok(editorActor);
   let draftCalls=0;
   const requests:any[]=[];
   const agentMock={chat:{completions:{create:async(request:any)=>{
     requests.push(request);
     draftCalls++;
     return {choices:[{message:draftCalls===1
      ? {role:'assistant',content:null,tool_calls:[{id:'prepare-1',type:'function',function:{name:'prepare_article',arguments:JSON.stringify({
         spaceId:shared,title:'Procedimento NTP '+id,
         content:'Para verificar sincronização de relógio, consulte chronyc tracking e registre o servidor utilizado.'
       })}}]}
      : {role:'assistant',content:'Prévia preparada, confirme no painel para criar o rascunho.'}
     }]};
   }}}} as unknown as OpenAI;
   const generated=await respond(editorActor!,conversationId,'Adicione este procedimento de NTP ao cérebro',[],agentMock);
   assert.equal(generated.pendingActions.length,1);
   assert.equal(generated.pendingActions[0].spaceName,'Conhecimento geral');
   assert.match(JSON.stringify(requests[0].messages),new RegExp(shared),'O modelo recebe apenas espaços autorizados para escrever');
   const pendingId=generated.pendingActions[0].id;
   const beforeConfirmation=await query('SELECT result_version_id FROM pending_actions WHERE id=$1',[pendingId]);
   assert.equal(beforeConfirmation.rows[0].result_version_id,null);
   const pendingInChat=await app.inject({method:'GET',url:`/conversations/${conversationId}`,headers:auth(reader.cookie)});
   assert.equal(pendingInChat.statusCode,200,pendingInChat.body);
   assert.equal(pendingInChat.json().pendingActions.length,1);
   assert.equal(pendingInChat.json().pendingActions[0].spaceName,'Conhecimento geral');
   const otherUserChat=await app.inject({method:'GET',url:`/conversations/${conversationId}`,headers:auth(reviewer.cookie)});
   assert.equal(otherUserChat.statusCode,404);
   const savedMessage=await app.inject({method:'POST',url:`/conversations/${conversationId}/messages`,headers:auth(reader.cookie),payload:{message:'Preciso de ajuda para diagnosticar NTP'}});
   assert.equal(savedMessage.statusCode,200,savedMessage.body);
   const conversationList=await app.inject({method:'GET',url:'/conversations',headers:auth(reader.cookie)});
   assert.equal(conversationList.statusCode,200);
   assert.ok(conversationList.json().conversations.some((c:any)=>c.id===conversationId&&c.title.includes('diagnosticar NTP')));
   const reviewerConversations=await app.inject({method:'GET',url:'/conversations',headers:auth(reviewer.cookie)});
   assert.equal(reviewerConversations.statusCode,200);
   assert.equal(reviewerConversations.json().conversations.some((c:any)=>c.id===conversationId),false);
   const reopened=await app.inject({method:'GET',url:`/conversations/${conversationId}`,headers:auth(reader.cookie)});
   assert.equal(reopened.json().messages.length,2);
   assert.equal(reopened.json().pendingActions.length,1);
   const confirmed=await app.inject({method:'POST',url:`/knowledge/pending/${pendingId}/confirm`,headers:auth(reader.cookie)});
   assert.equal(confirmed.statusCode,200,confirmed.body);
   const draftDoc=await query('SELECT current_version_id FROM documents WHERE id=$1',[confirmed.json().documentId]);
   assert.equal(draftDoc.rows[0].current_version_id,null,'A preview must not publish content');
   const draftHidden=await app.inject({method:'GET',url:`/knowledge/documents/${confirmed.json().documentId}`,headers:auth(reader.cookie)});
   assert.equal(draftHidden.statusCode,404);
   const mine=await app.inject({method:'GET',url:'/knowledge/mine',headers:auth(reader.cookie)});
   assert.equal(mine.statusCode,200,mine.body);
   assert.ok(mine.json().drafts.some((d:any)=>d.version_id===confirmed.json().versionId));
   const others=await app.inject({method:'GET',url:'/knowledge/mine',headers:auth(reviewer.cookie)});
   assert.equal(others.statusCode,200);
   assert.equal(others.json().drafts.some((d:any)=>d.version_id===confirmed.json().versionId),false);
   const ownDraft=await app.inject({method:'GET',url:`/knowledge/drafts/${confirmed.json().versionId}`,headers:auth(reader.cookie)});
   assert.equal(ownDraft.statusCode,200,ownDraft.body);
   assert.match(ownDraft.json().content,/chronyc tracking/);
   const forbiddenDraft=await app.inject({method:'GET',url:`/knowledge/drafts/${confirmed.json().versionId}`,headers:auth(reviewer.cookie)});
   assert.equal(forbiddenDraft.statusCode,404);

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
   assert.equal(allowedRead.json().space_id,shared);
   assert.equal(allowedRead.json().version.id,sharedDoc.versionId);
   const originalSource=await app.inject({method:'GET',url:`/knowledge/documents/${sharedDoc.documentId}/versions/${sharedDoc.versionId}`,headers:auth(reader.cookie)});
   assert.equal(originalSource.statusCode,200,originalSource.body);
   assert.equal(originalSource.json().isCurrent,true);
   // An unpublished revision must never be retrievable through source links.
   const revision=await app.inject({method:'POST',url:`/knowledge/documents/${sharedDoc.documentId}/versions`,headers:auth(reader.cookie),payload:{content:'Nova revisão: verificar o DNS usando dig, validar respostas e documentar os testes executados no servidor.',baseVersionId:sharedDoc.versionId}});
   assert.equal(revision.statusCode,201,revision.body);
   const revisionId=revision.json().versionId as string;
   const draftSource=await app.inject({method:'GET',url:`/knowledge/documents/${sharedDoc.documentId}/versions/${revisionId}`,headers:auth(reader.cookie)});
   assert.equal(draftSource.statusCode,404);
   const ownRevision=await app.inject({method:'GET',url:`/knowledge/drafts/${revisionId}`,headers:auth(reader.cookie)});
   assert.equal(ownRevision.statusCode,200);
   assert.match(ownRevision.json().content,/verificar o DNS/);
   const unauthorizedRevision=await app.inject({method:'GET',url:`/knowledge/drafts/${revisionId}`,headers:auth(reviewer.cookie)});
   assert.equal(unauthorizedRevision.statusCode,404);
   await app.inject({method:'POST',url:`/knowledge/versions/${revisionId}/submit-review`,headers:auth(reader.cookie)});
   let revisionReady=false;
   for(let i=0;i<45;i++){
     const index=await query('SELECT index_status FROM document_versions WHERE id=$1',[revisionId]);
     if(index.rows[0].index_status==='READY'){revisionReady=true;break;}
     await new Promise(resolve=>setTimeout(resolve,400));
   }
   assert.equal(revisionReady,true);
   const revPublished=await app.inject({method:'POST',url:`/knowledge/versions/${revisionId}/publish`,headers:auth(reviewer.cookie),payload:{confirm:true}});
   assert.equal(revPublished.statusCode,200,revPublished.body);
   const historySource=await app.inject({method:'GET',url:`/knowledge/documents/${sharedDoc.documentId}/versions/${sharedDoc.versionId}`,headers:auth(reader.cookie)});
   assert.equal(historySource.statusCode,200,historySource.body);
   assert.equal(historySource.json().isCurrent,false);
   assert.equal(historySource.json().version.status,'ARCHIVED');
   const newestSource=await app.inject({method:'GET',url:`/knowledge/documents/${sharedDoc.documentId}/versions/${revisionId}`,headers:auth(reader.cookie)});
   assert.equal(newestSource.statusCode,200);

   const rejectMalformedPdf=await app.inject({method:'POST',url:'/knowledge/articles',headers:auth(reader.cookie),payload:{spaceId:shared,title:'x',content:'short'}});
   assert.equal(rejectMalformedPdf.statusCode,400);


   // A genuine PDF is accepted, extracted by the worker, and only then eligible for publication.
   const pdfDocument=await PDFDocument.create();
   const page=pdfDocument.addPage([600,400]);
   const font=await pdfDocument.embedFont(StandardFonts.Helvetica);
   page.drawText('Checklist de seguranca: confira logs, backups e registros antes de executar qualquer procedimento.',{x:40,y:340,size:12,font,maxWidth:500});
   const pdfBytes=Buffer.from(await pdfDocument.save({useObjectStreams:false}));
   const boundary='test-boundary-'+id;
   const body=Buffer.concat([
     Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="spaceId"\r\n\r\n${shared}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="procedimento.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
     pdfBytes,Buffer.from(`\r\n--${boundary}--\r\n`)
   ]);
   const pdfUpload=await app.inject({method:'POST',url:'/knowledge/pdfs',headers:{...auth(reader.cookie),'content-type':`multipart/form-data; boundary=${boundary}`},payload:body});
   assert.equal(pdfUpload.statusCode,201,pdfUpload.body);
   let pdfReady=false;
   for(let i=0;i<45;i++){
     const status=await query('SELECT index_status FROM document_versions WHERE id=$1',[pdfUpload.json().versionId]);
     if(status.rows[0].index_status==='READY'){pdfReady=true;break;}
     if(status.rows[0].index_status==='FAILED')break;
     await new Promise(resolve=>setTimeout(resolve,400));
   }
   const pdfJob=await query('SELECT error FROM ingestion_jobs WHERE version_id=$1',[pdfUpload.json().versionId]);
   assert.equal(pdfReady,true,'worker must extract valid PDF; '+String(pdfJob.rows[0]?.error??'unknown'));
   const restrictedDenied=await app.inject({method:'POST',url:'/knowledge/articles',headers:auth(reader.cookie),payload:{spaceId:restricted,title:'Restrito '+id,content:'Este texto somente deve ser acessado por leitores especificamente autorizados.'}});
   assert.equal(restrictedDenied.statusCode,403);

   await query('INSERT INTO space_grants(user_id,space_id,can_read,can_edit,can_approve) VALUES($1,$2,true,true,true)',[reviewer.id,restricted]);
   const privDraft=await app.inject({method:'POST',url:'/knowledge/articles',headers:auth(reviewer.cookie),payload:{spaceId:restricted,title:'Segredo '+id,content:'Instrução de teste restrito: procedimento interno sobre um servidor de laboratório isolado.'}});
   assert.equal(privDraft.statusCode,201,privDraft.body);
   const privateDoc=privDraft.json() as {documentId:string;versionId:string};
   const leaked=await app.inject({method:'GET',url:`/knowledge/documents/${privateDoc.documentId}`,headers:auth(reader.cookie)});
   assert.equal(leaked.statusCode,404);
   const leakedVersion=await app.inject({method:'GET',url:`/knowledge/documents/${privateDoc.documentId}/versions/${privateDoc.versionId}`,headers:auth(reader.cookie)});
   assert.equal(leakedVersion.statusCode,404);

   const adminGrant=await app.inject({method:'POST',url:`/admin/spaces/${restricted}/grants`,headers:auth(admin.cookie),payload:{userId:reader.id,read:true,edit:false,approve:false}});
   assert.equal(adminGrant.statusCode,200,adminGrant.body);
   const granted=await app.inject({method:'GET',url:'/spaces',headers:auth(reader.cookie)});
   assert.equal(granted.json().spaces.find((s:any)=>s.id===restricted).can_read,true);
   await app.inject({method:'POST',url:`/admin/spaces/${restricted}/grants`,headers:auth(admin.cookie),payload:{userId:reader.id,read:false,edit:false,approve:false}});
   const revoked=await app.inject({method:'GET',url:'/spaces',headers:auth(reader.cookie)});
   assert.equal(revoked.json().spaces.find((s:any)=>s.id===restricted).can_read,false);


   // An unauthorized reader must never receive a published restricted snippet.
   const privateVer=privateDoc.versionId;
   await app.inject({method:'POST',url:`/knowledge/versions/${privateVer}/submit-review`,headers:auth(reviewer.cookie)});
   let readyPrivate=false;
   for(let i=0;i<45;i++){
     const r=await query('SELECT index_status FROM document_versions WHERE id=$1',[privateVer]);
     if(r.rows[0].index_status==='READY'){readyPrivate=true;break;}
     await new Promise(resolve=>setTimeout(resolve,400));
   }
   assert.equal(readyPrivate,true);
   const privateApproved=await app.inject({method:'POST',url:`/knowledge/versions/${privateVer}/publish`,headers:auth(reviewer.cookie),payload:{confirm:true}});
   assert.equal(privateApproved.statusCode,200,privateApproved.body);
   const readerActor=await actorForSession(reader.cookie.split('=')[1]);
   assert.ok(readerActor);
   assert.equal((await searchKnowledge(readerActor!,'laboratório isolado')).some(x=>x.documentId===privateDoc.documentId),false);
   await app.inject({method:'POST',url:`/admin/spaces/${restricted}/grants`,headers:auth(admin.cookie),payload:{userId:reader.id,read:true,edit:false,approve:false}});
   const grantedActor=await actorForSession(reader.cookie.split('=')[1]);
   assert.ok(grantedActor);
   assert.equal((await searchKnowledge(grantedActor!,'laboratório isolado')).some(x=>x.documentId===privateDoc.documentId),true);
   await app.inject({method:'POST',url:`/admin/spaces/${restricted}/grants`,headers:auth(admin.cookie),payload:{userId:reader.id,read:false,edit:false,approve:false}});
   assert.equal((await searchKnowledge(grantedActor!,'laboratório isolado')).some(x=>x.documentId===privateDoc.documentId),false);

   // Admin onboarding uses a single-use temporary token, never a known initial password.
   const onboardingEmail=`onboarding-${id}@example.test`;
   const created=await app.inject({method:'POST',url:'/admin/users',headers:auth(admin.cookie),payload:{email:onboardingEmail,role:'USER'}});
   assert.equal(created.statusCode,201,created.body);
   const reset=created.json() as {resetToken:string};
   assert.ok(reset.resetToken.length>20);
   const change=await app.inject({method:'POST',url:'/auth/change-password',payload:{resetToken:reset.resetToken,newPassword:'new-Secure-Password-123!'}});
   assert.equal(change.statusCode,200,change.body);
   const reuse=await app.inject({method:'POST',url:'/auth/change-password',payload:{resetToken:reset.resetToken,newPassword:'another-Secure-Password-123!'}});
   assert.equal(reuse.statusCode,401,'Temporary token must be single use');
   const active=await app.inject({method:'POST',url:'/auth/login',payload:{email:onboardingEmail,password:'new-Secure-Password-123!'}});
   assert.equal(active.statusCode,200);
   const badOrigin=await app.inject({method:'POST',url:'/conversations',headers:{cookie:reader.cookie,origin:'https://evil.invalid'}});
   assert.equal(badOrigin.statusCode,403);
  } finally {
   worker?.kill('SIGTERM');
   await app.close();
   await pool.end();
  }
 });
}
