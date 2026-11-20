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

   // Feedback belongs only to assistant messages the authenticated user can currently see.
   const assistantMessageId=savedMessage.json().id as string;
   const userMessageId=reopened.json().messages.find((m:any)=>m.role==='user').id as string;
   const invalidRating=await app.inject({method:'POST',url:'/feedback',headers:auth(reader.cookie),
     payload:{messageId:assistantMessageId,rating:'NEUTRAL'}});
   assert.equal(invalidRating.statusCode,400);
   const wrongOwner=await app.inject({method:'POST',url:'/feedback',headers:auth(reviewer.cookie),
     payload:{messageId:assistantMessageId,rating:'GOOD'}});
   assert.equal(wrongOwner.statusCode,404);
   const userMessageFeedback=await app.inject({method:'POST',url:'/feedback',headers:auth(reader.cookie),
     payload:{messageId:userMessageId,rating:'GOOD'}});
   assert.equal(userMessageFeedback.statusCode,404);
   const secretFeedback=await app.inject({method:'POST',url:'/feedback',headers:auth(reader.cookie),
     payload:{messageId:assistantMessageId,rating:'BAD',comment:'api_key=abcdefghijklmnop'}});
   assert.equal(secretFeedback.statusCode,422);
   const tooLongFeedback=await app.inject({method:'POST',url:'/feedback',headers:auth(reader.cookie),
     payload:{messageId:assistantMessageId,rating:'BAD',comment:'a'.repeat(1001)}});
   assert.equal(tooLongFeedback.statusCode,400);
   const helpful=await app.inject({method:'POST',url:'/feedback',headers:auth(reader.cookie),
     payload:{messageId:assistantMessageId,rating:'GOOD',comment:'A resposta explicou os próximos passos.'}});
   assert.equal(helpful.statusCode,200,helpful.body);
   assert.equal(helpful.json().rating,'GOOD');
   const persistedFeedback=await app.inject({method:'GET',url:'/conversations/'+conversationId,
     headers:auth(reader.cookie)});
   const persistedAssistant=persistedFeedback.json().messages.find((m:any)=>m.id===assistantMessageId);
   assert.equal(persistedAssistant.feedback_rating,'GOOD');
   assert.match(persistedAssistant.feedback_comment,/próximos passos/);
   const repeated=await Promise.all(['BAD','GOOD'].map(rating=>app.inject({
     method:'POST',url:'/feedback',headers:auth(reader.cookie),
     payload:{messageId:assistantMessageId,rating}
   })));
   assert.deepEqual(repeated.map(x=>x.statusCode),[200,200]);
   const feedbackRows=await query('SELECT count(*)::int AS total FROM feedback WHERE user_id=$1 AND message_id=$2',
     [reader.id,assistantMessageId]);
   assert.equal(feedbackRows.rows[0].total,1,'Concurrent rating updates must not create duplicates');
   const responseFeedback=await app.inject({method:'GET',url:'/conversations/'+conversationId,
     headers:auth(reader.cookie)});
   const finalAssistant=responseFeedback.json().messages.find((m:any)=>m.id===assistantMessageId);
   assert.ok(['GOOD','BAD'].includes(finalAssistant.feedback_rating));
   assert.equal(finalAssistant.feedback_comment,null);
   const feedbackAudit=await query("SELECT count(*)::int AS total FROM audit_events WHERE action='ASSISTANT_FEEDBACK_SAVED' AND resource_id=$1",
     [assistantMessageId]);
   assert.equal(feedbackAudit.rows[0].total,3);

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


   // Creating a similar published procedure requires an explicit human rationale.
   const similarTitle='Procedimento DNS '+id+' - guia alternativo';
   const potentialDuplicate=await app.inject({method:'POST',url:'/knowledge/articles',headers:auth(reader.cookie),
     payload:{spaceId:shared,title:similarTitle,content:'Outro procedimento de DNS para demonstrar a criação justificada após verificação de duplicidade.'}});
   assert.equal(potentialDuplicate.statusCode,409,potentialDuplicate.body);
   assert.equal(potentialDuplicate.json().code,'SIMILAR_ARTICLES');
   assert.ok(potentialDuplicate.json().matches.some((d:any)=>d.id===sharedDoc.documentId));
   const noDuplicateCreated=await query('SELECT count(*)::int AS total FROM documents WHERE title=$1',[similarTitle]);
   assert.equal(noDuplicateCreated.rows[0].total,0);
   const shortReason=await app.inject({method:'POST',url:'/knowledge/articles',headers:auth(reader.cookie),
     payload:{spaceId:shared,title:similarTitle,content:'Outro procedimento de DNS, sem motivo suficiente para permitir a duplicação.',duplicateReason:'insuficiente'}});
   assert.equal(shortReason.statusCode,409);
   const secretReason=await app.inject({method:'POST',url:'/knowledge/articles',headers:auth(reader.cookie),
     payload:{spaceId:shared,title:similarTitle,content:'Outro procedimento de DNS, com motivo inválido por credencial.',duplicateReason:'api_key=abcdefghijklmnop'}});
   assert.equal(secretReason.statusCode,422);
   const acknowledged=await app.inject({method:'POST',url:'/knowledge/articles',headers:auth(reader.cookie),
     payload:{spaceId:shared,title:similarTitle,
       content:'Este procedimento aplica-se especificamente a uma configuração de DNS isolada do laboratório de testes.',
       duplicateReason:'É um procedimento diferente para uma rede de laboratório isolada.'}});
   assert.equal(acknowledged.statusCode,201,acknowledged.body);
   const auditDuplicate=await query("SELECT metadata->>'reason' AS reason FROM audit_events WHERE action='KNOWLEDGE_DUPLICATE_ACKNOWLEDGED' AND resource_id=$1",[acknowledged.json().documentId]);
   assert.match(auditDuplicate.rows[0].reason,/laboratório isolada/);

   // The conversational confirmation path enforces the same duplicate review.
   const pendingDuplicate=await query('INSERT INTO pending_actions(user_id,conversation_id,space_id,title,content) VALUES($1,$2,$3,$4,$5) RETURNING id',
     [reader.id,conversationId,shared,'Procedimento DNS '+id+' - chat alternativo',
      'Procedimento sugerido pelo chat para resolver falhas de DNS em um ambiente de homologação isolado.']);
   const pendingDuplicateId=pendingDuplicate.rows[0].id as string;
   const blockedPending=await app.inject({method:'POST',url:'/knowledge/pending/'+pendingDuplicateId+'/confirm',headers:auth(reader.cookie)});
   assert.equal(blockedPending.statusCode,409,blockedPending.body);
   assert.equal(blockedPending.json().code,'SIMILAR_ARTICLES');
   assert.ok(blockedPending.json().matches.some((d:any)=>d.id===sharedDoc.documentId));
   const approvedPending=await app.inject({method:'POST',url:'/knowledge/pending/'+pendingDuplicateId+'/confirm',
     headers:auth(reader.cookie),payload:{duplicateReason:'O procedimento descreve um ambiente de homologação independente.'}});
   assert.equal(approvedPending.statusCode,200,approvedPending.body);
   assert.ok(approvedPending.json().documentId);
   const repeatedPending=await app.inject({method:'POST',url:'/knowledge/pending/'+pendingDuplicateId+'/confirm',
     headers:auth(reader.cookie),payload:{duplicateReason:'O procedimento descreve um ambiente de homologação independente.'}});
   assert.equal(repeatedPending.statusCode,200,repeatedPending.body);
   assert.deepEqual(repeatedPending.json(),approvedPending.json(),'Repeated confirmation must be idempotent');

   // A reviewer can request corrections; doing so must never replace live knowledge.
   const waiting=await app.inject({method:'POST',url:'/knowledge/documents/'+sharedDoc.documentId+'/versions',
     headers:auth(reader.cookie),payload:{content:'Proposta de correção de DNS. Documente a resolução, compare TTLs e registre os testes de conectividade para validação.',baseVersionId:sharedDoc.versionId}});
   assert.equal(waiting.statusCode,201,waiting.body);
   const waitingId=waiting.json().versionId as string;
   const submit=await app.inject({method:'POST',url:'/knowledge/versions/'+waitingId+'/submit-review',headers:auth(reader.cookie)});
   assert.equal(submit.statusCode,200);
   const noNote=await app.inject({method:'POST',url:'/knowledge/versions/'+waitingId+'/request-changes',
     headers:auth(reviewer.cookie),payload:{note:'curto'}});
   assert.equal(noNote.statusCode,400);
   const forbiddenReview=await app.inject({method:'POST',url:'/knowledge/versions/'+waitingId+'/request-changes',
     headers:auth(reader.cookie),payload:{note:'É necessário especificar um teste mais claro.'}});
   assert.equal(forbiddenReview.statusCode,403);
   const requestChanges=await app.inject({method:'POST',url:'/knowledge/versions/'+waitingId+'/request-changes',
     headers:auth(reviewer.cookie),payload:{note:'Adicione evidências do teste de DNS e explique a validação do resultado.'}});
   assert.equal(requestChanges.statusCode,200,requestChanges.body);
   const repeatedRequest=await app.inject({method:'POST',url:'/knowledge/versions/'+waitingId+'/request-changes',
     headers:auth(reviewer.cookie),payload:{note:'Não deve ser possível solicitar ajustes novamente.'}});
   assert.equal(repeatedRequest.statusCode,409);
   const authorReviews=await app.inject({method:'GET',url:'/knowledge/mine',headers:auth(reader.cookie)});
   const requestedItem=authorReviews.json().drafts.find((v:any)=>v.version_id===waitingId);
   assert.equal(requestedItem.status,'CHANGES_REQUESTED');
   assert.match(requestedItem.review_note,/evidências do teste/i);
   const publishedWhileWaiting=await app.inject({method:'GET',url:'/knowledge/documents/'+sharedDoc.documentId,headers:auth(reader.cookie)});
   assert.equal(publishedWhileWaiting.json().version.id,sharedDoc.versionId);
   const correctedByOther=await app.inject({method:'POST',url:'/knowledge/versions/'+waitingId+'/correct',
     headers:auth(reviewer.cookie),payload:{content:'Uma tentativa de alterar o artigo de outro usuário não deve funcionar.'}});
   assert.equal(correctedByOther.statusCode,404);
   const correctionPayload={content:'Use dig para confirmar registros e TTLs, registre os resultados e documente a validação do DNS feita pelo técnico.'};
   const corrections=await Promise.all([0,1].map(()=>app.inject({
     method:'POST',url:'/knowledge/versions/'+waitingId+'/correct',
     headers:auth(reader.cookie),payload:correctionPayload
   })));
   assert.deepEqual(corrections.map(x=>x.statusCode).sort(),[201,409],
     'Two concurrent corrections must create exactly one draft');
   const correctedId=corrections.find(x=>x.statusCode===201)!.json().versionId as string;
   const correctedDraft=await app.inject({method:'GET',url:'/knowledge/drafts/'+correctedId,headers:auth(reader.cookie)});
   assert.equal(correctedDraft.statusCode,200);
   assert.equal(correctedDraft.json().status,'DRAFT');
   const superseded=await app.inject({method:'GET',url:'/knowledge/drafts/'+waitingId,headers:auth(reader.cookie)});
   assert.equal(superseded.statusCode,404);
   const restoredList=await app.inject({method:'GET',url:'/knowledge/mine',headers:auth(reader.cookie)});
   assert.equal(restoredList.json().drafts.some((v:any)=>v.version_id===waitingId),false);
   assert.equal(restoredList.json().drafts.some((v:any)=>v.version_id===correctedId),true);
   const correctionAudit=await query("SELECT count(*)::int AS count FROM audit_events WHERE action='KNOWLEDGE_CORRECTION_DRAFT_CREATED' AND resource_id=$1",[sharedDoc.documentId]);
   assert.equal(correctionAudit.rows[0].count,1);
   const samePublished=await app.inject({method:'GET',url:'/knowledge/documents/'+sharedDoc.documentId,headers:auth(reader.cookie)});
   assert.equal(samePublished.json().version.id,sharedDoc.versionId);

   // Rejection requires an auditable human explanation.
   const rejectedDraft=await app.inject({method:'POST',url:'/knowledge/documents/'+sharedDoc.documentId+'/versions',
     headers:auth(reader.cookie),payload:{content:'Proposta incompleta sobre configuração de DNS, sem descrever como o resultado deve ser validado.',baseVersionId:sharedDoc.versionId}});
   assert.equal(rejectedDraft.statusCode,201,rejectedDraft.body);
   const rejectedId=rejectedDraft.json().versionId as string;
   const toReview=await app.inject({method:'POST',url:'/knowledge/versions/'+rejectedId+'/submit-review',
     headers:auth(reader.cookie)});
   assert.equal(toReview.statusCode,200);
   const emptyReason=await app.inject({method:'POST',url:'/knowledge/versions/'+rejectedId+'/reject',
     headers:auth(reviewer.cookie),payload:{}});
   assert.equal(emptyReason.statusCode,400);
   const rejected=await app.inject({method:'POST',url:'/knowledge/versions/'+rejectedId+'/reject',
     headers:auth(reviewer.cookie),payload:{note:'O procedimento não informa como validar o resultado antes de sua publicação.'}});
   assert.equal(rejected.statusCode,200,rejected.body);
   const rejectedInfo=await app.inject({method:'GET',url:'/knowledge/drafts/'+rejectedId,headers:auth(reader.cookie)});
   assert.equal(rejectedInfo.statusCode,200);
   assert.equal(rejectedInfo.json().status,'REJECTED');
   assert.match(rejectedInfo.json().review_note,/não informa como validar/);

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

   // PDF editorial changes are new versions of the same document, never a new document.
   const pdfDocumentId=pdfUpload.json().documentId as string;
   const pdfOriginalId=pdfUpload.json().versionId as string;
   const initialSubmit=await app.inject({method:'POST',url:'/knowledge/versions/'+pdfOriginalId+'/submit-review',
     headers:auth(reader.cookie)});
   assert.equal(initialSubmit.statusCode,200,initialSubmit.body);
   const pdfReview=await app.inject({method:'POST',url:'/knowledge/versions/'+pdfOriginalId+'/request-changes',
     headers:auth(reviewer.cookie),payload:{note:'O checklist precisa explicar como registrar o resultado de cada verificação.'}});
   assert.equal(pdfReview.statusCode,200,pdfReview.body);
   const previousDraft=await app.inject({method:'GET',url:'/knowledge/drafts/'+pdfOriginalId,
     headers:auth(reader.cookie)});
   assert.equal(previousDraft.statusCode,200);
   assert.equal(previousDraft.json().status,'CHANGES_REQUESTED');

   async function makeTestPdf(text:string):Promise<Buffer>{
     const document=await PDFDocument.create();
     const page=document.addPage([600,400]);
     const font=await document.embedFont(StandardFonts.Helvetica);
     page.drawText(text,{x:40,y:340,size:12,font,maxWidth:500});
     return Buffer.from(await document.save({useObjectStreams:false}));
   }
   function pdfForm(bytes:Buffer,fields:Record<string,string>={}){
     const boundary='pdf-version-'+randomUUID();
     const segments:Buffer[]=[];
     for(const [name,value] of Object.entries(fields)){
       segments.push(Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="'+name+
         '"\r\n\r\n'+value+'\r\n'));
     }
     segments.push(Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="revisado.pdf"\r\n'+
       'Content-Type: application/pdf\r\n\r\n'));
     segments.push(bytes,Buffer.from('\r\n--'+boundary+'--\r\n'));
     return {body:Buffer.concat(segments),type:'multipart/form-data; boundary='+boundary};
   }
   async function indexed(versionId:string){
     let status='PENDING';
     for(let i=0;i<45;i++){
       const r=await query('SELECT index_status FROM document_versions WHERE id=$1',[versionId]);
       status=r.rows[0]?.index_status;
       if(status==='READY'||status==='FAILED')break;
       await new Promise(resolve=>setTimeout(resolve,400));
     }
     const r=await query('SELECT error FROM ingestion_jobs WHERE version_id=$1',[versionId]);
     assert.equal(status,'READY','PDF indexation failed: '+String(r.rows[0]?.error??'unknown'));
   }

   const wrongActor=pdfForm(await makeTestPdf('An invalid attempted PDF correction from an unrelated actor must never succeed.'));
   const unauthorizedPdf=await app.inject({method:'POST',url:'/knowledge/versions/'+pdfOriginalId+'/correct-pdf',
     headers:{...auth(reviewer.cookie),'content-type':wrongActor.type},payload:wrongActor.body});
   assert.equal(unauthorizedPdf.statusCode,404,'Only the original author may correct a proposed PDF');
   const invalidBytes=pdfForm(Buffer.from('this is not a valid PDF file at all'));
   const invalidPdf=await app.inject({method:'POST',url:'/knowledge/versions/'+pdfOriginalId+'/correct-pdf',
     headers:{...auth(reader.cookie),'content-type':invalidBytes.type},payload:invalidBytes.body});
   assert.equal(invalidPdf.statusCode,415);

   const correctedBytes=await makeTestPdf('Checklist revisado de seguranca: registre resultados de logs, backups, disponibilidade e validacao de servicos.');
   const pdfCorrections=await Promise.all([0,1].map(async()=>{
     const payload=pdfForm(correctedBytes);
     return app.inject({method:'POST',url:'/knowledge/versions/'+pdfOriginalId+'/correct-pdf',
       headers:{...auth(reader.cookie),'content-type':payload.type},payload:payload.body});
   }));
   assert.deepEqual(pdfCorrections.map(r=>r.statusCode).sort(),[201,409],
     'Concurrent PDF corrections must generate only one replacement');
   const newPdfVersion=pdfCorrections.find(r=>r.statusCode===201)!.json() as {documentId:string;versionId:string};
   assert.equal(newPdfVersion.documentId,pdfDocumentId);
   assert.notEqual(newPdfVersion.versionId,pdfOriginalId);
   const obsoletePdf=await app.inject({method:'GET',url:'/knowledge/drafts/'+pdfOriginalId,headers:auth(reader.cookie)});
   assert.equal(obsoletePdf.statusCode,404);
   const stillUnpublished=await app.inject({method:'GET',url:'/knowledge/documents/'+pdfDocumentId,headers:auth(reader.cookie)});
   assert.equal(stillUnpublished.statusCode,404);
   const pdfAudit=await query("SELECT count(*)::int AS count FROM audit_events WHERE action='KNOWLEDGE_PDF_CORRECTION_DRAFT_CREATED' AND resource_id=$1",[pdfDocumentId]);
   assert.equal(pdfAudit.rows[0].count,1);
   await indexed(newPdfVersion.versionId);
   const correctedExtracted=await app.inject({method:'GET',url:'/knowledge/drafts/'+newPdfVersion.versionId,headers:auth(reader.cookie)});
   assert.equal(correctedExtracted.statusCode,200);
   assert.match(correctedExtracted.json().content,/Checklist revisado/);

   const sendPdfReview=await app.inject({method:'POST',url:'/knowledge/versions/'+newPdfVersion.versionId+'/submit-review',
     headers:auth(reader.cookie)});
   assert.equal(sendPdfReview.statusCode,200);
   const publishPdf=await app.inject({method:'POST',url:'/knowledge/versions/'+newPdfVersion.versionId+'/publish',
     headers:auth(reviewer.cookie),payload:{confirm:true}});
   assert.equal(publishPdf.statusCode,200,publishPdf.body);
   const livePdf=await app.inject({method:'GET',url:'/knowledge/documents/'+pdfDocumentId,headers:auth(reader.cookie)});
   assert.equal(livePdf.statusCode,200);
   assert.equal(livePdf.json().version.id,newPdfVersion.versionId);

   const replacementBytes=await makeTestPdf('Terceira versao do checklist: valide os backups, confira a disponibilidade do servidor e registre evidencias.');
   const staleForm=pdfForm(replacementBytes,{baseVersionId:pdfOriginalId});
   const staleAttempt=await app.inject({method:'POST',url:'/knowledge/documents/'+pdfDocumentId+'/pdf-versions',
     headers:{...auth(reader.cookie),'content-type':staleForm.type},payload:staleForm.body});
   assert.equal(staleAttempt.statusCode,409,'A revision must target the current published version');
   const newForm=pdfForm(replacementBytes,{baseVersionId:newPdfVersion.versionId});
   const newDraftResponse=await app.inject({method:'POST',url:'/knowledge/documents/'+pdfDocumentId+'/pdf-versions',
     headers:{...auth(reader.cookie),'content-type':newForm.type},payload:newForm.body});
   assert.equal(newDraftResponse.statusCode,201,newDraftResponse.body);
   const newestDraft=newDraftResponse.json() as {documentId:string;versionId:string};
   assert.equal(newestDraft.documentId,pdfDocumentId);
   const stillLivePdf=await app.inject({method:'GET',url:'/knowledge/documents/'+pdfDocumentId,headers:auth(reader.cookie)});
   assert.equal(stillLivePdf.json().version.id,newPdfVersion.versionId,
     'An unreviewed PDF revision cannot replace published knowledge');
   const privatePdfRevision=await app.inject({method:'GET',url:'/knowledge/drafts/'+newestDraft.versionId,
     headers:auth(reviewer.cookie)});
   assert.equal(privatePdfRevision.statusCode,404,'Draft bytes/text must not be shown to another user');
   await indexed(newestDraft.versionId);
   const readyPdfReview=await app.inject({method:'POST',url:'/knowledge/versions/'+newestDraft.versionId+'/submit-review',
     headers:auth(reader.cookie)});
   assert.equal(readyPdfReview.statusCode,200,readyPdfReview.body);
   const publishedPdfRevision=await app.inject({method:'POST',url:'/knowledge/versions/'+newestDraft.versionId+'/publish',
     headers:auth(reviewer.cookie),payload:{confirm:true}});
   assert.equal(publishedPdfRevision.statusCode,200,publishedPdfRevision.body);
   const latestPdf=await app.inject({method:'GET',url:'/knowledge/documents/'+pdfDocumentId,headers:auth(reader.cookie)});
   assert.equal(latestPdf.json().version.id,newestDraft.versionId);
   const historicalPdf=await app.inject({method:'GET',url:'/knowledge/documents/'+pdfDocumentId+
     '/versions/'+newPdfVersion.versionId,headers:auth(reader.cookie)});
   assert.equal(historicalPdf.statusCode,200);
   assert.equal(historicalPdf.json().version.status,'ARCHIVED');

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
   // Administrator-only role changes and deactivation must revoke active sessions.
   const deniedRoleChange=await app.inject({method:'PATCH',url:`/admin/users/${admin.id}`,headers:auth(reader.cookie),payload:{role:'USER'}});
   assert.equal(deniedRoleChange.statusCode,403);
   const selfChange=await app.inject({method:'PATCH',url:`/admin/users/${admin.id}`,headers:auth(admin.cookie),payload:{active:false}});
   assert.equal(selfChange.statusCode,400);
   const disable=await app.inject({method:'PATCH',url:`/admin/users/${reader.id}`,headers:auth(admin.cookie),payload:{active:false}});
   assert.equal(disable.statusCode,200,disable.body);
   const sessionAfterDeactivation=await app.inject({method:'GET',url:'/auth/me',headers:auth(reader.cookie)});
   assert.equal(sessionAfterDeactivation.statusCode,401);
   const disabledLogin=await app.inject({method:'POST',url:'/auth/login',payload:{email:reader.email,password:reader.password}});
   assert.equal(disabledLogin.statusCode,401);
   const enable=await app.inject({method:'PATCH',url:`/admin/users/${reader.id}`,headers:auth(admin.cookie),payload:{active:true}});
   assert.equal(enable.statusCode,200);
   const reLogin=await app.inject({method:'POST',url:'/auth/login',payload:{email:reader.email,password:reader.password}});
   assert.equal(reLogin.statusCode,200,reLogin.body);
   const newCookie=reLogin.headers['set-cookie']?.toString().split(';')[0];
   assert.ok(newCookie);
   const roleChange=await app.inject({method:'PATCH',url:`/admin/users/${reader.id}`,headers:auth(admin.cookie),payload:{role:'APPROVER'}});
   assert.equal(roleChange.statusCode,200,roleChange.body);
   const sessionAfterRoleChange=await app.inject({method:'GET',url:'/auth/me',headers:auth(newCookie)});
   assert.equal(sessionAfterRoleChange.statusCode,401);
   const changedLogin=await app.inject({method:'POST',url:'/auth/login',payload:{email:reader.email,password:reader.password}});
   assert.equal(changedLogin.statusCode,200,changedLogin.body);
   assert.equal(changedLogin.json().user.role,'APPROVER');
   const changedCookie=changedLogin.headers['set-cookie']?.toString().split(';')[0];
   assert.ok(changedCookie);
   const obsoleteFeedback=await app.inject({method:'POST',url:'/feedback',headers:auth(changedCookie),
     payload:{messageId:assistantMessageId,rating:'GOOD'}});
   assert.equal(obsoleteFeedback.statusCode,404,'Old conversation must not remain rateable after a permission revision');

  } finally {
   worker?.kill('SIGTERM');
   await app.close();
   await pool.end();
  }
 });
}
