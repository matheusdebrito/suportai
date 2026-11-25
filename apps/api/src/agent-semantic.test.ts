import {test} from 'node:test';
import assert from 'node:assert/strict';
import type OpenAI from 'openai';
import {reviewDraftIntent} from './agent-intent.js';
import {verifyGroundedAnswer} from './agent-verifier.js';
import type {Source} from './retrieval.js';

function mockedProvider(content:string|null,requests:any[]):OpenAI{
 return {chat:{completions:{create:async(request:any)=>{
  requests.push(request);
  return {choices:[{message:{role:'assistant',content}}]};
 }}}} as unknown as OpenAI;
}
test('write intent review sees only user messages, never retrieved documents',async()=>{
 const requests:any[]=[];
 const decision=await reviewDraftIntent(mockedProvider('{"requested":true}',requests),
  'Boa, guarda essa solução no cérebro.',[
   {role:'user',content:'Calibrei a impressora fictícia.'},
   {role:'assistant',content:'A calibração resolveu o problema.'}
  ],2000);
 assert.deepEqual(decision,{allowed:true,verified:true});
 assert.equal(requests.length,1);
 assert.equal(requests[0].response_format.type,'json_object');
 assert.ok(!JSON.stringify(requests[0]).includes('INSTRUCAO_MALICIOSA_PDF'));
});
test('write intent is denied when model declines or replies invalid JSON',async()=>{
 assert.deepEqual(await reviewDraftIntent(mockedProvider('{"requested":false}',[]),
  'Como registrar um artigo?',[],2000),{allowed:false,verified:true});
 assert.deepEqual(await reviewDraftIntent(mockedProvider('Claro, salvo agora',[]),
  'Salve o documento',[],2000),{allowed:false,verified:false});
});
test('semantic verifier returns supported and only uses supplied evidence',async()=>{
 const requests:any[]=[];
 const source:Source={documentId:'a',versionId:'versao-autorizada',versionNumber:2,
  title:'Impressora fictícia',ordinal:0,
  content:'Confira o alinhamento e só então calibre a impressora.',score:0.8};
 const result=await verifyGroundedAnswer(mockedProvider('{"verdict":"supported"}',requests),
  'Qual a ordem?', 'Confira o alinhamento e depois calibre.', [source]);
 assert.equal(result,'supported');
 const payload=JSON.stringify(requests[0]);
 assert.match(payload,/versao-autorizada/);
 assert.match(payload,/Confira o alinhamento/);
});
test('semantic verifier fails closed on incompatible, undecidable or malformed answers',async()=>{
 const source:Source={documentId:'a',versionId:'b',versionNumber:1,
  title:'Manual sintético',ordinal:0,content:'Não reinicie antes de verificar os logs.',score:0.8};
 assert.equal(await verifyGroundedAnswer(mockedProvider('{"verdict":"unsupported"}',[]),
  'O que fazer?', 'Reinicie imediatamente.',[source]),'unsupported');
 assert.equal(await verifyGroundedAnswer(mockedProvider('resposta inválida',[]),
  'O que fazer?', 'Reinicie imediatamente.',[source]),'uncertain');
 assert.equal(await verifyGroundedAnswer(mockedProvider('{"verdict":"supported"}',[]),
  'O que fazer?', 'Sem evidências.',[]),'unsupported');
});
