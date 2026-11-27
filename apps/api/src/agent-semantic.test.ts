import {test} from 'node:test';
import assert from 'node:assert/strict';
import type OpenAI from 'openai';
import {reviewDraftIntent} from './agent-intent.js';
import {verifyGroundedAnswer} from './agent-verifier.js';
import type {Source} from './retrieval.js';
import {benchmarkGrounding,groundingCases,measureGroundingErrors} from './grounding-benchmark.js';

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

test('grounding benchmarks separate false acceptance and false blocking on fictional labels',async()=>{
 const checks={
  current:(quote:string,evidence=1,unit=1)=>({unit,kind:'current',refs:[{evidence,quote}]}),
  historical:(quote:string)=>({unit:1,kind:'historical',refs:[{evidence:2,quote}]})
 };
 const supported=(...claims:unknown[])=>({verdict:'supported',claims});
 const reports:Record<string,unknown>={
  'phone-fields':supported(
    checks.current('Para telefone Grandstream, consulte Status > Network Status > IPV4.',1,1),
    checks.current('Para telefone Grandstream, consulte Status > Network Status > IPV4.',1,2),
    checks.current('Abra Accounts > General Settings.',1,3),
    checks.current('Account Active: YES',1,4),
    checks.current('SIP Server: sip.example.test',1,5)),
  'phone-invented-field':supported(checks.current('SIP Server: sip.example.test')),
  'current-condition':supported(checks.current('No ambiente Azul, aguarde 15 segundos.')),
  'current-negation':supported(checks.current('Não religue antes de conferir o visor.')),
  'historical-comparison':supported(checks.historical('No ambiente Azul, aguarde 10 segundos.'),
    checks.current('No ambiente Azul, aguarde 15 segundos.',1,2)),
  'invented-number':supported(checks.current('No ambiente Azul, aguarde 15 segundos.')),
  'invented-ip':supported(checks.current('Use 192.0.2.53.')),
  'incomplete-evidence':supported(checks.current('No ambiente Azul, aguarde 15 segundos.')),
  'old-as-current':supported(checks.current('No ambiente Azul, aguarde 10 segundos.',2)),
  'unresolved-conflict':{verdict:'conflict',claims:[]}
 };
 const provider={chat:{completions:{create:async(request:OpenAI.Chat.Completions.ChatCompletionCreateParams)=>{
  const parsed=JSON.parse(String(request.messages[1].content)) as {units:{text:string}[];evidence:unknown[]};
  const normalize=(value:string)=>value.replace(/\s+/g,' ').trim();
  const answer=parsed.units.map(unit=>unit.text).join(' ');
  const item=groundingCases.find(fixture=>normalize(fixture.answer)===normalize(answer)&&fixture.sources.length===parsed.evidence.length);
  assert.ok(item,answer);
  return {choices:[{message:{content:JSON.stringify(reports[item.id]??{verdict:'unsupported',claims:[]})}}]};
 }}}} as unknown as OpenAI;
 const benchmark=await benchmarkGrounding(provider);
 assert.deepEqual(benchmark.rows.filter(row=>row.accepted!==row.shouldAccept),[], 'Grounding classification mismatch (case and reason)');
 assert.deepEqual(benchmark.metrics,{supported:4,unsupported:11,falseBlocked:0,falseAccepted:0,falseBlockRate:0,falseAcceptRate:0});
 assert.equal(benchmark.rows.find(row=>row.id==='unresolved-conflict')?.verdict,'conflict');
 assert.equal(benchmark.rows.find(row=>row.id==='phone-fields')?.verdict,'supported');
 assert.equal(benchmark.rows.find(row=>row.id==='phone-invented-field')?.reason,'unsupported_literal');
 assert.deepEqual(measureGroundingErrors([{shouldAccept:true,accepted:false},{shouldAccept:false,accepted:true}]),
  {supported:1,unsupported:1,falseBlocked:1,falseAccepted:1,falseBlockRate:1,falseAcceptRate:1});
});

test('grounding preserves verified equipment scope and rejects dropping it from a procedure',async()=>{
 const fixture=groundingCases.find(item=>item.id==='phone-fields')!;
 const answer='Para telefone Grandstream:\n1. Consulte Status > Network Status > IPV4.';
 const quote='Para telefone Grandstream, consulte Status > Network Status > IPV4.';
 const claims=[{unit:1,kind:'current',refs:[{evidence:1,quote}]},{unit:2,kind:'current',refs:[{evidence:1,quote}]}];
 const accepted=await verifyGroundedAnswer(mockedProvider(JSON.stringify({verdict:'supported',claims}),[]),fixture.question!,answer,fixture.sources);
 assert.equal(accepted.verdict,'supported');
 if(accepted.verdict==='supported'){
  assert.match(accepted.answer,/Para telefone Grandstream:/);
  assert.equal(accepted.unsupportedUnits,0);
  assert.doesNotMatch(accepted.answer,/Não consegui confirmar/);
 }
 for(const kind of ['nonclaim','unsupported']){
  const omitted=[{unit:1,kind,refs:[]},claims[1]];
  const result=await verifyGroundedAnswer(mockedProvider(JSON.stringify({verdict:'supported',claims:omitted}),[]),fixture.question!,answer,fixture.sources);
  assert.equal(result.verdict,'unsupported','Scope cannot be dropped from a procedural list');
 }
});

test('grounding safely fills sparse verifier rows only for framing and progress questions',async()=>{
 const source:Source={documentId:'phone',versionId:'phone-v1',versionNumber:1,title:'Telefone de laboratório',ordinal:0,
  content:'1. Consulte o IP no menu Status.\n2. Abra o IP no navegador.',score:1};
 const answer='Vamos por etapas. Primeiro, faça o seguinte:\n\n1. Consulte o IP no menu Status.\n2. Abra o IP no navegador.\n\nConseguiu concluir essa etapa?';
 const sparse=[
  {unit:3,kind:'current',refs:[{evidence:1,quote:'1. Consulte o IP no menu Status.'}]},
  {unit:4,kind:'current',refs:[{evidence:1,quote:'2. Abra o IP no navegador.'}]}
 ];
 const result=await verifyGroundedAnswer(mockedProvider(JSON.stringify({verdict:'supported',claims:sparse}),[]),'configurar telefone',answer,[source]);
 assert.equal(result.verdict,'supported');
 if(result.verdict==='supported'){
  assert.match(result.answer,/Conseguiu concluir essa etapa\?/);
  assert.equal(result.nonclaimsRemoved,2);
  assert.equal(result.unsupportedUnits,0);
 }
 const missingFact=await verifyGroundedAnswer(mockedProvider(JSON.stringify({verdict:'supported',claims:[sparse[0]]}),[]),'configurar telefone',answer,[source]);
 assert.notEqual(missingFact.verdict,'supported','A missing factual step must still fail closed');
});

test('grounding rejects a fabricated evidence ID and a quote absent from the cited excerpt',async()=>{
 const item=groundingCases.find(item=>item.id==='current-condition')!;
 for(const ref of [{evidence:2,quote:'No ambiente Azul, aguarde 15 segundos.'},{evidence:1,quote:'Um trecho que não existe.'}]){
  const provider=mockedProvider(JSON.stringify({verdict:'supported',claims:[{unit:1,kind:'current',refs:[ref]}]}),[]);
  assert.equal((await verifyGroundedAnswer(provider,'Qual procedimento?',item.answer,item.sources)).verdict,'unsupported');
 }
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
 const result=await verifyGroundedAnswer(mockedProvider(JSON.stringify({verdict:'supported',claims:[{unit:1,kind:'current',refs:[
  {evidence:1,quote:source.content}
 ]}]}),requests),
  'Qual a ordem?', 'Confira o alinhamento e depois calibre.', [source]);
 assert.equal(result.verdict,'supported');
 assert.deepEqual(result.sources,[{...source,excerpts:[source.content]}]);
 const payload=JSON.stringify(requests[0]);
 assert.match(payload,/versao-autorizada/);
 assert.match(payload,/Confira o alinhamento/);
});
test('semantic verifier fails closed on incompatible, undecidable or malformed answers',async()=>{
 const source:Source={documentId:'a',versionId:'b',versionNumber:1,
  title:'Manual sintético',ordinal:0,content:'Não reinicie antes de verificar os logs.',score:0.8};
 assert.equal((await verifyGroundedAnswer(mockedProvider('{"verdict":"unsupported","claims":[]}',[]),
  'O que fazer?', 'Reinicie imediatamente.',[source])).verdict,'unsupported');
 assert.equal((await verifyGroundedAnswer(mockedProvider('resposta inválida',[]),
  'O que fazer?', 'Reinicie imediatamente.',[source])).verdict,'uncertain');
 assert.equal((await verifyGroundedAnswer(mockedProvider('{"verdict":"supported"}',[]),
  'O que fazer?', 'Sem evidências.',[])).verdict,'unsupported');
});


test('strict grounding contract rejects malformed objects before semantic review',async()=>{
 const fixture=groundingCases.find(item=>item.id==='current-condition')!;
 const valid={unit:1,kind:'current',refs:[{evidence:1,quote:fixture.answer}]};
 const requests:any[]=[];
 const run=(value:unknown)=>verifyGroundedAnswer(mockedProvider(JSON.stringify(value),requests),'procedimento',fixture.answer,fixture.sources);
 const accepted=await run({verdict:'supported',claims:[valid]});
 assert.equal(accepted.verdict,'supported');
 assert.equal(requests[0].response_format.type,'json_schema');
 assert.equal(requests[0].response_format.json_schema.strict,true);
 assert.equal(requests[0].response_format.json_schema.schema.additionalProperties,false);
 for(const value of [
  {verdict:'supported',claims:[valid],extra:true},
  {verdict:'unknown',claims:[]},
  {verdict:'supported'},
  {verdict:'supported',claims:[{...valid,extra:true}]},
  {verdict:'supported',claims:[{...valid,kind:'invented'}]},
  {verdict:'supported',claims:[{...valid,refs:[{...valid.refs[0],extra:true}]}]}
 ])assert.deepEqual(await run(value),{verdict:'uncertain',reason:'schema_invalid'});
 assert.deepEqual(await run({verdict:'supported',claims:[]}),{verdict:'uncertain',reason:'claim_shape'});
 const refusal={chat:{completions:{create:async()=>({choices:[{message:{refusal:'not available',content:null}}]})}}} as unknown as OpenAI;
 assert.deepEqual(await verifyGroundedAnswer(refusal,'procedimento',fixture.answer,fixture.sources),{verdict:'uncertain',reason:'model_refusal'});
 const incompatible={chat:{completions:{create:async()=>{throw {status:400,param:'response_format'};}}}} as unknown as OpenAI;
 assert.deepEqual(await verifyGroundedAnswer(incompatible,'procedimento',fixture.answer,fixture.sources),{verdict:'uncertain',reason:'provider_incompatible'});
});
test('strict grounding contract rejects duplicate units even with valid schema',async()=>{
 const source=groundingCases.find(item=>item.id==='current-condition')!.sources[0];
 const row={unit:1,kind:'current',refs:[{evidence:1,quote:'No ambiente Azul, aguarde 15 segundos.'}]};
 const result=await verifyGroundedAnswer(mockedProvider(JSON.stringify({verdict:'supported',claims:[row,row]}),[]),'procedimento','No ambiente Azul, aguarde 15 segundos. Não religue antes de conferir o visor.',[source]);
 assert.deepEqual(result,{verdict:'uncertain',reason:'claim_shape'});
});
