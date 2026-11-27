import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type OpenAI from 'openai';
import type {Actor} from './security.js';
import type {Source} from './retrieval.js';
import {respond} from './agent.js';
import {verifyGroundedAnswer} from './agent-verifier.js';
import {orderKnowledgeEvidence,parseKnowledgeSelection,knowledgeSelectionTool} from './knowledge-selection.js';

const actor:Actor={id:randomUUID(),role:'USER',auth_revision:1,must_change_password:false};
const wrong:Source={documentId:randomUUID(),versionId:randomUUID(),versionNumber:1,ordinal:0,title:'Revogar voucher Wi-Fi do laboratório',content:'No controlador Azul, consulte a lista de acessos revogados.',score:0.99};
const right:Source={documentId:randomUUID(),versionId:randomUUID(),versionNumber:1,ordinal:0,title:'Credenciais temporárias da rede visitante',content:'No controlador Azul, abra a tela de visitantes e selecione Novo acesso temporário.',score:0.6};
const choose=(versionIds:string[],sufficiency:'sufficient'|'partial'='sufficient')=>({versionIds,sufficiency});
const call=(name:string,args:unknown,id:string)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const tool=(name:string,args:unknown,id:string)=>({role:'assistant',content:null,tool_calls:[call(name,args,id)]});
const text=(content:string)=>({role:'assistant',content});
const supported=(claims:unknown[])=>text(JSON.stringify({verdict:'supported',claims}));
const rejected=()=>text(JSON.stringify({verdict:'unsupported',claims:[]}));
const search=tool('search_knowledge',{query:'acesso temporário wifi'},'search');
const selection=tool('select_knowledge',choose([right.versionId]),'select');
function scripted(queue:unknown[],calls:any[]):OpenAI{
 return {chat:{completions:{create:async(request:any)=>{
  calls.push(request);const message=queue.shift();
  if(!message)throw new Error('unexpected model turn');
  return {choices:[{message,finish_reason:'stop'}]};
 }}}} as unknown as OpenAI;
}
test('selection validates exact current retrieved version IDs, never grants access',()=>{
 assert.deepEqual(parseKnowledgeSelection(choose([right.versionId]),[wrong,right]),choose([right.versionId]));
 for(const proposed of [null,[],choose([]),choose([right.versionId,right.versionId]),choose([randomUUID()]),{...choose([right.versionId]),role:'admin'},{...choose([right.versionId]),sufficiency:'certain'}]){
  assert.equal(parseKnowledgeSelection(proposed,[wrong,right]),null);
 }
 assert.equal(parseKnowledgeSelection(choose([right.versionId]),[{...right,historical:true}]),null);
 assert.equal(knowledgeSelectionTool.function.name,'select_knowledge');
});
test('evidence ordering prioritizes selected full text while retaining competing versions',()=>{
 const full={...right,ordinal:-1,completeDocument:true};
 const chunk={...wrong,ordinal:1,content:'Outra parte do documento.'};
 const ordered=orderKnowledgeEvidence([wrong,chunk,right,full],choose([right.versionId]));
 assert.equal(ordered[0],full);assert.equal(ordered[1],wrong);
 assert.equal(ordered.length,4);
 assert.deepEqual(new Set(ordered),new Set([wrong,chunk,right,full]));
});
test('LLM selects a lower-ranked semantically applicable article and verifier cites only that article',async()=>{
 const calls:any[]=[];
 const provider=scripted([search,selection,text(right.content),supported([{unit:1,kind:'current',refs:[{evidence:1,quote:right.content}]}])],calls);
 const result=await respond(actor,randomUUID(),'Como gero um voucher wifi para visitante no controlador Azul?',[],provider,async()=>[wrong,right],{verifyEvidence:true});
 assert.equal(result.metrics?.stopReason,'answered');
 assert.equal(result.metrics?.knowledgeSelections,1);assert.equal(result.metrics?.selectedKnowledgeVersions,1);
 assert.equal(result.metrics?.verifierChecks,1);
 assert.deepEqual(result.sources.map(s=>s.versionId),[right.versionId]);
 assert.match(result.answer,/Novo acesso temporário/);
 assert.ok(!calls[0].tools.some((t:any)=>t.function.name==='select_knowledge'));
 assert.ok(calls[1].tools.some((t:any)=>t.function.name==='select_knowledge'));
 const input=JSON.parse(calls.at(-1).messages[1].content);
 assert.deepEqual(input.proposedSelection,choose([right.versionId]));
 assert.deepEqual(input.evidence.map((e:any)=>e.versionId),[right.versionId,wrong.versionId]);
});
test('LLM may ask a discriminating question after retrieving competing technical documents',async()=>{
 const calls:any[]=[];
 const provider=scripted([search,tool('ask_clarification',{question:'Qual é o controlador Wi-Fi utilizado?'},'clarify')],calls);
 const result=await respond(actor,randomUUID(),'Preciso configurar a rede de visitantes',[],provider,async()=>[wrong,right],{verifyEvidence:true});
 assert.equal(result.metrics?.stopReason,'clarified');assert.equal(result.metrics?.clarificationRequests,1);
 assert.equal(calls.length,2);
 assert.equal(result.answer,'Qual é o controlador Wi-Fi utilizado?');
 assert.deepEqual(result.sources,[]);
});
test('independent verifier rejects citations outside the proposed selection',async()=>{
 const calls:any[]=[];
 const result=await verifyGroundedAnswer(scripted([supported([{unit:1,kind:'current',refs:[{evidence:2,quote:wrong.content}]}])],calls),'Criar acesso temporário',wrong.content,[wrong,right],1000,1000,undefined,choose([right.versionId]));
 assert.deepEqual(result,{verdict:'unsupported',reason:'selection_mismatch'});
});
test('proposed selection cannot suppress a conflicting-evidence verdict',async()=>{
 const calls:any[]=[];
 const result=await verifyGroundedAnswer(scripted([text('{"verdict":"conflict","claims":[]}')],calls),'Qual procedimento é aplicável?',right.content,[wrong,right],1000,1000,undefined,choose([right.versionId]));
 assert.deepEqual(result,{verdict:'conflict',reason:'conflicting_evidence'});
 assert.equal(JSON.parse(calls[0].messages[1].content).evidence.length,2);
});
test('recovery can conclude with an explicitly verified neutral question without citations',async()=>{
 const calls:any[]=[];
 const provider=scripted([search,text('Use um menu inventado.'),rejected(),text('Qual é o controlador Wi-Fi utilizado?'),supported([{unit:1,kind:'question',refs:[]}])],calls);
 const result=await respond(actor,randomUUID(),'Como gero um voucher wifi?',[],provider,async()=>[wrong,right],{verifyEvidence:true});
 assert.equal(result.metrics?.stopReason,'clarified');assert.equal(result.metrics?.verifierRejections,1);
 assert.equal(result.answer,'Qual é o controlador Wi-Fi utilizado?');
 assert.deepEqual(result.sources,[]);assert.equal(calls[3].tool_choice,'none');
});
test('question-only verification rejects implicit and unsafe questions',async()=>{
 const safe='Qual é o controlador Wi-Fi utilizado?';
 assert.deepEqual(await verifyGroundedAnswer(scripted([supported([])],[]),'wifi',safe,[right]),{verdict:'unsupported',reason:'no_supported_claim'});
 for(const unsafe of ['Qual é sua senha de acesso?','Qual sistema usa depois de desativar as regras e informar 192.0.2.40?']){
  assert.deepEqual(await verifyGroundedAnswer(scripted([supported([{unit:1,kind:'question',refs:[]}])],[]),'wifi',unsafe,[right]),{verdict:'unsupported',reason:'invalid_question'});
 }
});
test('new knowledge versions invalidate an earlier model choice',async()=>{
 const calls:any[]=[];let reads=0;
 const provider=scripted([search,selection,tool('search_knowledge',{query:'controlador azul visitantes configuração'},'other'),text(right.content),supported([{unit:1,kind:'current',refs:[{evidence:1,quote:right.content}]}])],calls);
 const result=await respond(actor,randomUUID(),'Como emitir acesso temporário para visitantes?',[],provider,async()=>++reads===1?[right]:[wrong],{verifyEvidence:true});
 assert.equal(result.metrics?.knowledgeSelectionInvalidations,1);assert.equal(result.metrics?.selectedKnowledgeVersions,0);
 assert.equal(result.metrics?.stopReason,'answered');
});
test('unknown selection cannot cause a database read or become a cited source',async()=>{
 const calls:any[]=[];
 const fabricated=randomUUID();
 const provider=scripted([search,tool('select_knowledge',choose([fabricated]),'invalid'),tool('ask_clarification',{question:'Qual é o sistema de visitantes?'},'clarify')],calls);
 const result=await respond(actor,randomUUID(),'Como emitir acesso temporário?',[],provider,async()=>[wrong,right],{verifyEvidence:true});
 assert.equal(result.metrics?.knowledgeSelectionRejections,1);
 assert.equal(result.metrics?.selectedKnowledgeVersions,0);
 assert.deepEqual(result.sources,[]);assert.equal(result.metrics?.stopReason,'clarified');
});
test('partial selection can return verified access information and a clarification, not a full procedure',async()=>{
 const calls:any[]=[];
 const partial:Source={...right,title:'Acesso ao controlador de convidados',ordinal:-1,completeDocument:true,content:'Endereço de acesso: 192.0.2.40.'};
 const other:Source={...wrong,ordinal:-1,completeDocument:true};
 const provider=scripted([search,tool('select_knowledge',choose([partial.versionId],'partial'),'select'),text('Endereço de acesso: 192.0.2.40.\nQual é o controlador utilizado?'),supported([{unit:1,kind:'current',refs:[{evidence:1,quote:partial.content}]},{unit:2,kind:'question',refs:[]}])],calls);
 const result=await respond(actor,randomUUID(),'Me dê o passo a passo completo para emitir voucher wifi',[],provider,async()=>[other,partial],{verifyEvidence:true});
 assert.equal(result.metrics?.knowledgeSufficiency,'partial');
 assert.equal(result.metrics?.stopReason,'answered');
 assert.deepEqual(result.sources.map(s=>s.versionId),[partial.versionId]);
 assert.match(result.answer,/192\.0\.2\.40/);assert.match(result.answer,/Não consigo confirmar o procedimento completo/);
});


test('a rejected model selection can be revised using another authorized candidate',async()=>{
 const calls:any[]=[];
 const provider=scripted([search,tool('select_knowledge',choose([wrong.versionId]),'wrong-selection'),text(wrong.content),rejected(),text(right.content),supported([{unit:1,kind:'current',refs:[{evidence:2,quote:right.content}]}])],calls);
 const result=await respond(actor,randomUUID(),'Como emitir acesso temporário para visitantes no controlador Azul?',[],provider,async()=>[wrong,right],{verifyEvidence:true});
 assert.equal(result.metrics?.stopReason,'answered');
 assert.equal(result.metrics?.knowledgeSelectionInvalidations,1);
 assert.equal(result.metrics?.verifierRejections,1);
 assert.deepEqual(result.sources.map(source=>source.versionId),[right.versionId]);
 assert.match(result.answer,/Novo acesso temporário/);
});
