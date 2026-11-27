import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type OpenAI from 'openai';
import type {Actor} from './security.js';
import type {Source} from './retrieval.js';
import {AgentBudget,DEFAULT_AGENT_LIMITS} from './agent-budget.js';
import {applySemanticMemory,interpretSemanticTurn,parseSemanticTurn,SEMANTIC_TURN_FORMAT,type SemanticTurn,type SemanticTurnInput} from './semantic-turn.js';
import {neutralQuestionCandidate,reviewDialogueReply} from './dialogue-review.js';
import {respond} from './agent.js';
import {verifyGroundedAnswer,verifySourceAlignedProcedure} from './agent-verifier.js';
import {indexEvidenceSpans,indexedGroundingResponseFormat,parseIndexedGroundingReview,INDEXED_GROUNDING_SCHEMA_VERSION,COMPLETE_GROUNDING_SCHEMA_VERSION} from './grounding-contract.js';

const actor:Actor={id:randomUUID(),role:'USER',auth_revision:1,must_change_password:false};
const caseId=randomUUID();
const message='Quero emitir acesso temporário na rede Verde. Acho que a tela mudou.';
const input:SemanticTurnInput={message,subjects:[{id:caseId,topic:'Visitantes'}],activeId:caseId,history:[]};
const semantic=(changes:Partial<SemanticTurn>={}):SemanticTurn=>({
 route:'existing',investigationId:caseId,topic:null,intent:'knowledge',mode:'adaptive',focused:false,
 query:'emitir acesso temporário rede Verde',equipment:null,environment:null,observations:[],...changes
});
const assistant=(content:string)=>({role:'assistant',content});
const tool=(name:string,args:unknown,id=name)=>({role:'assistant',content:null,tool_calls:[{id,type:'function',function:{name,arguments:JSON.stringify(args)}}]});
function scripted(messages:unknown[],requests:any[]=[]):OpenAI{
 const queue=[...messages];
 return {chat:{completions:{create:async(request:any)=>{
  requests.push(request);
  const next=queue.shift();
  if(!next)throw new Error('Unexpected model call');
  return {choices:[{message:next,finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:30}};
 }}}} as unknown as OpenAI;
}
const source=(title:string,content:string,score=0.8):Source=>({documentId:randomUUID(),versionId:randomUUID(),versionNumber:1,ordinal:0,title,content,score});
const blue=source('Controlador Azul — visitantes','No controlador Azul, abra a área Visitantes e selecione Emitir voucher.',0.99);
const green=source('Controlador Verde — visitantes','No controlador Verde, abra a área Rede de convidados e selecione Novo acesso temporário.',0.7);
const ground=(quote:string,evidence=1)=>assistant(JSON.stringify({verdict:'supported',claims:[{unit:1,kind:'current',refs:[{evidence,quote}]}]}));
const review=(accepted:boolean)=>assistant(JSON.stringify({accepted}));
const select=(s:Source,sufficiency:'sufficient'|'partial'='sufficient')=>tool('select_knowledge',{versionIds:[s.versionId],sufficiency});
function plannedBudget(){const budget=new AgentBudget();assert.ok(budget.startModelTurn());budget.recordModelUsage({prompt_tokens:100,completion_tokens:30},0,0);return budget;}

test('semantic turn accepts an authorized subject, original operation and literal user observations',()=>{
 const decision=semantic({mode:'inherit',environment:'rede Verde',observations:[{kind:'hypothesis',quote:'Acho que a tela mudou.',result:null}]});
 assert.deepEqual(parseSemanticTurn(decision,input),decision);
 const old={topic:'Visitantes',reportedFacts:['Usuário relatou acesso indisponível'],hypotheses:[],openQuestions:[],tests:[],sourceVersionIds:[randomUUID()],supportPreference:'guided' as const};
 const draft=applySemanticMemory('Visitantes',decision,old);
 assert.equal(draft.supportPreference,'guided');
 assert.equal(draft.environment,'rede Verde');
 assert.deepEqual(draft.hypotheses,['Acho que a tela mudou.']);
 assert.deepEqual(draft.reportedFacts,old.reportedFacts);
 assert.deepEqual(draft.sourceVersionIds,old.sourceVersionIds);
 assert.deepEqual(old.hypotheses,[]);
});
test('semantic turn rejects unknown IDs, fabricated observations, test results, unsafe fields and malformed outputs',()=>{
 for(const decision of [
  semantic({investigationId:randomUUID()}),
  semantic({topic:'Outro assunto'}),
  semantic({query:'token: abcdefghijklmnopqrstuvwxyz'}),
  semantic({route:'standalone',investigationId:null,query:''}),
  semantic({route:'uncertain',investigationId:null,intent:'knowledge'}),
  {...semantic(),extra:'unexpected'}
 ])assert.equal(parseSemanticTurn(decision,input),null);
});
test('semantic turn canonicalizes redundant routing and drops untrusted optional memory fields',()=>{
 const result=parseSemanticTurn(semantic({topic:'Visitantes',equipment:'equipamento não relatado',
  observations:[{kind:'fact',quote:'A IA confirmou o resultado.',result:null},{kind:'test',quote:'Acho que a tela mudou.',result:'funcionou'}]}),input);
 assert.deepEqual(result,semantic({equipment:null,observations:[]}));
});
test('semantic turn honors an explicit named resume over the currently active subject',()=>{
 const ris=randomUUID(),erp=randomUUID();
 const resumeInput:SemanticTurnInput={message:'Voltando ao RIS de laboratório',activeId:erp,history:[],subjects:[
  {id:ris,topic:'RIS de laboratório'},{id:erp,topic:'ERP de laboratório'}
 ]};
 const result=parseSemanticTurn({...semantic(),investigationId:erp,query:'RIS de laboratório'},resumeInput);
 assert.equal(result?.route,'existing');
 assert.equal(result?.investigationId,ris);
 assert.equal(result?.topic,null);
});
test('semantic turn isolates an explicit additional incident and resumes a uniquely named subject',()=>{
 const badge=randomUUID(),printer=randomUUID();
 const subjects=[{id:badge,topic:'Crachá temporário no laboratório Nimbo'},{id:printer,topic:'Impressão em branco no laboratório Nimbo'}];
 const additional:SemanticTurnInput={message:'A impressão aqui no Nimbo também saiu toda em branco, me ajuda?',activeId:badge,history:[],subjects};
 const created=parseSemanticTurn({...semantic(),investigationId:badge,query:'impressão em branco laboratório Nimbo',observations:[{kind:'fact',quote:'A impressão aqui no Nimbo também saiu toda em branco',result:null}]},additional);
 assert.equal(created?.route,'new');
 assert.equal(created?.investigationId,null);
 assert.match(created?.topic??'',/impressão/i);
 const resume:SemanticTurnInput={message:'Quero terminar aquele negócio do crachá',activeId:printer,history:[],subjects};
 const resumed=parseSemanticTurn({...semantic(),investigationId:printer,query:'emitir crachá temporário'},resume);
 assert.equal(resumed?.route,'existing');
 assert.equal(resumed?.investigationId,badge);
});
test('semantic interpreter uses strict structured outputs and charges the shared budget',async()=>{
 const calls:any[]=[];
 const budget=new AgentBudget();
 const decision=semantic();
 const result=await interpretSemanticTurn(scripted([assistant(JSON.stringify(decision))],calls),input,budget);
 assert.deepEqual(result,{status:'accepted',decision});
 assert.equal(budget.steps,1);
 assert.equal(budget.promptTokens,100);
 assert.equal(budget.completionTokens,30);
 assert.deepEqual(calls[0].response_format,SEMANTIC_TURN_FORMAT);
 assert.equal((await interpretSemanticTurn(null,input,new AgentBudget())).status,'disabled');
 assert.equal((await interpretSemanticTurn(scripted([assistant('{}')]),input,new AgentBudget())).status,'invalid');
 const exhausted=new AgentBudget({...DEFAULT_AGENT_LIMITS,maxSteps:0});
 assert.equal((await interpretSemanticTurn(scripted([]),input,exhausted)).status,'budget');
});
test('semantic responder requires explicit selection of competing knowledge and preserves alternatives in the verifier',async()=>{
 const requests:any[]=[];
 const chosen='No controlador Verde, abra a área Rede de convidados e selecione Novo acesso temporário.';
 const result=await respond(actor,randomUUID(),message,[],scripted([
  tool('search_knowledge',{query:'emitir acesso temporário rede Verde'}),
  assistant(blue.content),
  select(green),
  assistant(chosen),
  ground(green.content)
 ],requests),async()=>[blue,green],{semantic:semantic(),semanticTurnStatus:'accepted',budget:plannedBudget(),verifyEvidence:true});
 assert.equal(result.metrics?.selectionRequired,1);
 assert.equal(result.metrics?.knowledgeSelections,1);
 assert.equal(result.metrics?.steps,6);
 assert.deepEqual(result.sources.map(s=>s.versionId),[green.versionId]);
 assert.match(result.answer,/Novo acesso temporário/);assert.doesNotMatch(result.answer,/Emitir voucher/);
 const final=JSON.parse(requests.at(-1).messages[1].content);
 assert.equal(final.question,message);
 assert.deepEqual(final.proposedSelection.versionIds,[green.versionId]);
 assert.deepEqual(new Set(final.evidence.map((s:any)=>s.versionId)),new Set([blue.versionId,green.versionId]));
 assert.match(final.conversationContext,/emitir acesso temporário rede Verde/);
});
test('the LLM can ask a reviewed, discriminating question without selecting an arbitrary source',async()=>{
 const question='Você utiliza o controlador Azul ou Verde?';
 const calls:any[]=[];
 const result=await respond(actor,randomUUID(),'Como emito o acesso de visitantes?',[],scripted([
  tool('search_knowledge',{query:'emitir acesso visitantes'}),
  tool('ask_clarification',{question}),
  review(true)
 ],calls),async()=>[blue,green],{semantic:semantic({route:'standalone',investigationId:null,query:'emitir acesso visitantes'}),budget:plannedBudget(),verifyEvidence:true});
 assert.equal(result.answer,question);assert.deepEqual(result.sources,[]);
 assert.equal(result.metrics?.clarificationChecks,1);
 assert.equal(result.metrics?.stopReason,'clarified');
 assert.equal(calls.at(-1).response_format.json_schema.name,'dialogue_review_v1');
});
test('independent conflict review gives the model a bounded read-only opportunity to clarify',async()=>{
 const calls:any[]=[];
 const question='Qual controlador está instalado no ambiente de visitantes?';
 const result=await respond(actor,randomUUID(),'Como emito o acesso de visitantes?',[],scripted([
  tool('search_knowledge',{query:'emitir acesso visitantes'}),
  select(blue),assistant(blue.content),
  assistant(JSON.stringify({verdict:'conflict',claims:[]})),
  tool('ask_clarification',{question}),review(true)
 ],calls),async()=>[blue,green],{semantic:semantic({query:'emitir acesso visitantes'}),budget:plannedBudget(),verifyEvidence:true});
 assert.equal(result.answer,question);assert.deepEqual(result.sources,[]);
 assert.equal(result.metrics?.conflictRecoveries,1);
 assert.equal(result.metrics?.clarificationChecks,1);
 assert.equal(result.metrics?.literalFallbacks,0);
 assert.equal(result.metrics?.steps,7);
 const recovery=calls[4];
 assert.ok(recovery.tools.some((t:any)=>t.function.name==='ask_clarification'));
 assert.ok(recovery.tools.every((t:any)=>!['prepare_article','list_writable_spaces','respond_social'].includes(t.function.name)));
});
test('partial access note uses grounded IP only, without reproducing unrelated credentials',async()=>{
 const voucher=source('Gerar voucher Wi-Fi de laboratório','IP: 192.0.2.40  login: conta-fixture  senha: valor-fixture');
 const result=await respond(actor,randomUUID(),'Como gero um voucher Wi-Fi de laboratório?',[],scripted([
  tool('search_knowledge',{query:'gerar voucher wifi laboratório'}),
  assistant('O endereço de acesso é 192.0.2.40.'),
  ground('IP: 192.0.2.40')
 ]),async()=>[voucher],{semantic:semantic({query:'gerar voucher wifi laboratório',focused:true}),budget:plannedBudget(),verifyEvidence:true});
 assert.equal(result.metrics?.stopReason,'answered');assert.match(result.answer,/192\.0\.2\.40/);
 assert.deepEqual(result.sources[0].excerpts,['IP: 192.0.2.40']);
 assert.doesNotMatch(result.answer,/conta-fixture|valor-fixture/);
});
test('semantic rejection never becomes a lexical instruction dump',async()=>{
 const result=await respond(actor,randomUUID(),'Como emito o acesso Verde?',[],scripted([
  tool('search_knowledge',{query:'emitir acesso verde'}),assistant('Use uma operação não confirmada.'),
  assistant(JSON.stringify({verdict:'unsupported',claims:[]})),
  assistant('Use outra operação não confirmada.'),assistant(JSON.stringify({verdict:'unsupported',claims:[]}))
 ]),async()=>[green],{semantic:semantic({query:'emitir acesso verde'}),budget:plannedBudget(),verifyEvidence:true});
 assert.equal(result.metrics?.verifierRejections,2);
 assert.equal(result.metrics?.literalFallbacks,0);
 assert.deepEqual(result.sources,[]);assert.doesNotMatch(result.answer,/Novo acesso temporário|operação não confirmada/);
});
test('question and social review do not trust malformed or fact-bearing replies',async()=>{
 assert.equal(neutralQuestionCandidate('Você utiliza o controlador Azul ou Verde?'),true);
 assert.equal(neutralQuestionCandidate('O acesso já foi liberado. Você utiliza o controlador Verde?'),false);
 assert.equal(neutralQuestionCandidate('Qual é sua senha?'),false);
 assert.equal(neutralQuestionCandidate('Acesse 192.0.2.40?'),false);
 assert.equal(await reviewDialogueReply(scripted([assistant('{}')]),new AgentBudget(),'question','Qual controlador você utiliza?',message,[blue,green]),false);
 assert.equal(await reviewDialogueReply(scripted([review(false)]),new AgentBudget(),'social','A política interna já permite isso.',message,[]),false);
});
test('grounding reviewer sees every bounded current candidate, including the last competing version',async()=>{
 const candidates=Array.from({length:12},(_,i)=>source('Candidato '+i,'Trecho de teste '+i));
 const calls:any[]=[];
 await verifyGroundedAnswer(scripted([assistant(JSON.stringify({verdict:'conflict',claims:[]}))],calls),
  message,candidates[0].content,candidates,1000,1000,undefined,{versionIds:[candidates[0].versionId],sufficiency:'sufficient'});
 const evidence=JSON.parse(calls[0].messages[1].content).evidence;
 assert.equal(evidence.length,12);
 assert.ok(evidence.some((s:any)=>s.versionId===candidates[11].versionId));
});

test('complete semantic review repairs an invalid reference within the shared budget',async()=>{
 const doc={...green,ordinal:-1,completeDocument:true};
 const candidate=green.content;
 const calls:any[]=[];
 const result=await respond(actor,randomUUID(),'Me dê o procedimento completo do controlador Verde.',[],scripted([
  tool('search_knowledge',{query:'emitir acesso verde'}),assistant(candidate),
  assistant(JSON.stringify({verdict:'supported',coverage:'complete',issue:'none',claims:{u1:{kind:'current',refs:['unknown-span']}}})),
  assistant(JSON.stringify({verdict:'supported',coverage:'complete',issue:'none',claims:{u1:{kind:'current',refs:['e1s1']}}}))
 ],calls),async()=>[doc],{semantic:semantic({mode:'complete',query:'emitir acesso verde'}),budget:plannedBudget(),verifyEvidence:true});
 assert.equal(result.metrics?.verifierRepairs,1);
 assert.equal(result.metrics?.verifierChecks,2);
 assert.equal(result.metrics?.steps,5);
 assert.deepEqual(result.sources.map(s=>s.versionId),[doc.versionId]);
 assert.match(result.answer,/Novo acesso temporário/);
 const reviews=calls.filter(c=>[COMPLETE_GROUNDING_SCHEMA_VERSION].includes(c.response_format?.json_schema?.name));
 assert.equal(reviews.length,2);
 const before=JSON.parse(reviews[0].messages[1].content),after=JSON.parse(reviews[1].messages[1].content);
 assert.equal(after.question,before.question);
 assert.deepEqual(after.units.map((unit:any)=>unit.text),before.units.map((unit:any)=>unit.text));
 assert.deepEqual(after.evidence[0].spans,[{id:'e1s1',text:candidate}]);
 assert.equal(reviews[1].response_format.json_schema.name,COMPLETE_GROUNDING_SCHEMA_VERSION);
 assert.match(reviews[1].messages[0].content,/schema_invalid/);
 assert.equal(result.metrics?.completeProcedureVerified,true);
});
test('a semantic rejection is not erased by a subsequent structural failure',async()=>{
 const doc={...green,ordinal:-1,completeDocument:true};
 const result=await respond(actor,randomUUID(),'Me dê o procedimento completo do controlador Verde.',[],scripted([
  tool('search_knowledge',{query:'emitir acesso verde'}),assistant('Use uma operação não confirmada.'),
  assistant(JSON.stringify({verdict:'unsupported',coverage:'not_applicable',issue:'wrong_scope',claims:null})),
  assistant(green.content),assistant(JSON.stringify({verdict:'supported',coverage:'complete',issue:'none',claims:{u1:{kind:'current',refs:['invented']}}})),
  assistant(JSON.stringify({verdict:'supported',coverage:'complete',issue:'none',claims:{u1:{kind:'current',refs:['invented-again']}}}))
 ]),async()=>[doc],{semantic:semantic({mode:'complete',query:'emitir acesso verde'}),budget:plannedBudget(),verifyEvidence:true});
 assert.equal(result.metrics?.verifierRepairs,1);
 assert.equal(result.metrics?.literalFallbacks,0);
 assert.deepEqual(result.sources,[]);
 assert.equal(result.metrics?.stopReason,'unsafe_answer');
});

test('indexed grounding requires every unit and only exact server-generated evidence IDs',()=>{
 const passages=[{text:'Somente no ambiente Verde.\nAbra o painel.\nConsulte o inventário.'},{text:'Somente no ambiente Azul.\nAbra a área Visitantes.'}];
 const spans=indexEvidenceSpans(passages);
 assert.ok(spans.every(span=>passages[span.evidence-1].text.includes(span.quote)&&span.quote.length<=240));
 assert.deepEqual(indexedGroundingResponseFormat(2).json_schema.schema.properties.claims.anyOf[0],{
  type:'object',additionalProperties:false,required:['u1','u2'],properties:{u1:{$ref:'#/$defs/claim'},u2:{$ref:'#/$defs/claim'}}
 });
 const good={verdict:'supported',claims:{u1:{kind:'current',refs:['e1s1','e1s2']},u2:{kind:'current',refs:['e1s3']}}};
 assert.deepEqual(parseIndexedGroundingReview(good,2,spans)?.claims[1],{unit:2,kind:'current',refs:[{evidence:1,quote:'Consulte o inventário.'}]});
 assert.equal(parseIndexedGroundingReview({verdict:'supported',claims:{u1:good.claims.u1}},2,spans),null);
 assert.equal(parseIndexedGroundingReview({verdict:'supported',claims:{...good.claims,u2:{kind:'current',refs:['invented']}}},2,spans),null);
 assert.equal(parseIndexedGroundingReview({verdict:'conflict',claims:good.claims},2,spans),null);
 assert.deepEqual(parseIndexedGroundingReview({verdict:'conflict',claims:null},2,spans),{verdict:'conflict',claims:[]});
 const long='condição de teste '.repeat(100);
 const chunks=indexEvidenceSpans([{text:long}]);
 assert.ok(chunks.length>1&&chunks.every(span=>long.includes(span.quote)&&span.quote.length<=240));
});
test('indexed grounding still rejects a reference to an unselected competing source',async()=>{
 const candidate=green.content;
 const response=assistant(JSON.stringify({verdict:'supported',claims:{u1:{kind:'current',refs:['e2s1']}}}));
 const result=await verifyGroundedAnswer(scripted([response]),message,candidate,[green,blue],1000,1000,undefined,{versionIds:[green.versionId],sufficiency:'sufficient'},undefined,'claim_shape');
 assert.deepEqual(result,{verdict:'unsupported',reason:'selection_mismatch'});
});
test('semantic interpreter repairs an invalid decision within the shared budget without accepting unknown IDs',async()=>{
 const calls:any[]=[];
 const budget=new AgentBudget();
 const invalid=semantic({investigationId:randomUUID()});
 const result=await interpretSemanticTurn(scripted([assistant(JSON.stringify(invalid)),assistant(JSON.stringify(semantic()))],calls),input,budget);
 assert.deepEqual(result,{status:'accepted',decision:semantic()});
 assert.equal(budget.steps,2);
 assert.match(calls[1].messages[0].content,/rejeitada pelo contrato/);
 const rejected=await interpretSemanticTurn(scripted([assistant(JSON.stringify(invalid)),assistant(JSON.stringify(invalid))]),input,new AgentBudget());
 assert.deepEqual(rejected,{status:'invalid'});
});

test('explicit resume resolves a shorter system name inside a descriptive authorized subject',()=>{
 const ris=randomUUID(),erp=randomUUID();
 const input:SemanticTurnInput={message:'Voltando ao RIS de laboratório',activeId:erp,history:[],subjects:[
  {id:ris,topic:'Configurar RIS de laboratório'},{id:erp,topic:'Consultar inventário no ERP de laboratório'}
 ]};
 const result=parseSemanticTurn(semantic({investigationId:erp,query:'RIS de laboratório'}),input);
 assert.equal(result?.investigationId,ris);
});
test('semantic clarification cannot skip a useful authorized lookup',async()=>{
 const calls:any[]=[];let searches=0;
 const result=await respond(actor,randomUUID(),'Como emito acesso na rede Verde?',[],scripted([
  tool('ask_clarification',{question:'Qual controlador você utiliza?'}),
  assistant(green.content),ground(green.content)
 ],calls),async()=>{searches++;return [green];},{semantic:semantic(),budget:plannedBudget(),verifyEvidence:true});
 assert.equal(searches,1);
 assert.deepEqual(calls[0].tool_choice,{type:'function',function:{name:'search_knowledge'}});
 assert.deepEqual(result.sources.map(s=>s.versionId),[green.versionId]);
});

test('complete review rejects supported but incomplete guidance even with a full source',async()=>{
 const doc={...green,ordinal:-1,completeDocument:true,content:'No controlador Verde, abra o painel.\nConfirme a emissão.'};
 const partial='Abra o painel.';
 const candidate=assistant(JSON.stringify({verdict:'supported',coverage:'partial',issue:'missing_coverage',claims:{u1:{kind:'current',refs:['e1s1']}}}));
 const result=await verifyGroundedAnswer(scripted([candidate]),'Me dê o procedimento completo',partial,[doc],1000,1000,undefined,undefined,undefined,undefined,true);
 assert.deepEqual(result,{verdict:'unsupported',reason:'incomplete_procedure',issue:'missing_coverage'});
 const falselyComplete=assistant(JSON.stringify({verdict:'supported',coverage:'complete',issue:'none',claims:{u1:{kind:'current',refs:['e1s1']}}}));
 const chunk={...doc,ordinal:0,completeDocument:false};
 assert.deepEqual(await verifyGroundedAnswer(scripted([falselyComplete]),'Me dê o procedimento completo',partial,[chunk],1000,1000,undefined,undefined,undefined,undefined,true),{verdict:'unsupported',reason:'incomplete_procedure',issue:'missing_coverage'});
});
test('complete mode rewrites a partial answer instead of accepting a full-document citation',async()=>{
 const doc={...green,ordinal:-1,completeDocument:true,content:'Abra o painel.\nConfirme a emissão.'};
 const indexed=(coverage:string,claims:Record<string,unknown>)=>assistant(JSON.stringify({verdict:'supported',coverage,issue:coverage==='complete'?'none':'missing_coverage',claims}));
 const calls:any[]=[];
 const result=await respond(actor,randomUUID(),'Me dê o procedimento completo',[],scripted([
  tool('search_knowledge',{query:'emitir acesso verde'}),assistant('Abra o painel.'),
  indexed('partial',{u1:{kind:'current',refs:['e1s1']}}),
  assistant(JSON.stringify({verdict:'supported',issue:'none'}))
 ],calls),async()=>[doc],{semantic:semantic({mode:'complete'}),budget:plannedBudget(),verifyEvidence:true});
 assert.equal(result.metrics?.completeProcedureVerified,true);
 assert.equal(result.metrics?.verifierFailures?.incomplete_procedure,1);
 assert.equal(result.metrics?.sourceAlignedReviews,1);
 assert.match(result.answer,/Confirme a emissão/);
 assert.equal(result.metrics?.literalFallbacks,0);
});

test('a replacement candidate still requires independent approval and never bypasses conflict',async()=>{
 const doc={...green,ordinal:-1,completeDocument:true,content:'Abra o painel.\nConfirme a emissão.'};
 const calls:any[]=[];
 const result=await respond(actor,randomUUID(),'Me dê o procedimento completo',[],scripted([
  tool('search_knowledge',{query:'emitir acesso verde'}),assistant('Abra o painel.'),
  assistant(JSON.stringify({verdict:'unsupported',coverage:'not_applicable',issue:'unsupported_content',claims:null})),
  assistant(JSON.stringify({verdict:'conflict',issue:'unresolved_conflict'}))
 ],calls),async()=>[doc],{semantic:semantic({mode:'complete'}),budget:new AgentBudget({...DEFAULT_AGENT_LIMITS,maxSteps:5}),verifyEvidence:true});
 assert.equal(result.metrics?.sourceAlignedReviews,1);
 assert.notEqual(result.metrics?.completeProcedureVerified,true);
 assert.deepEqual(result.sources,[]);
 assert.equal(result.metrics?.stopReason,'source_conflict');
 const review=JSON.parse(calls.at(-1).messages[1].content);
 assert.equal(review.candidate,doc.content);
 assert.equal(calls.at(-1).response_format.json_schema.name,'source_aligned_review_v1');
});

test('exact-document review preserves the published procedure and rejects altered text before calling the model',async()=>{
 const doc={...green,ordinal:-1,completeDocument:true,content:'Abra o painel.\n2. Use a senha padrão demo-default.\nConfirme a emissão.'};
 const calls:any[]=[];
 const provider=scripted([assistant(JSON.stringify({verdict:'supported',issue:'none'}))],calls);
 const result=await verifySourceAlignedProcedure(provider,'Me dê o procedimento completo',doc.content,[doc],1000,1000,()=>{});
 assert.equal(result.verdict,'supported');
 if(result.verdict==='supported'){
  assert.equal(result.answer,doc.content+' [1]');
  assert.deepEqual(result.sources[0].excerpts,[doc.content]);
  assert.equal(result.completeProcedureVerified,true);
 }
 assert.equal(calls.length,1);
 const altered=await verifySourceAlignedProcedure(provider,'Me dê o procedimento completo',doc.content.replace('demo-default','other-value'),[doc],1000,1000,()=>{});
 assert.deepEqual(altered,{verdict:'unsupported',reason:'invalid_reference'});
 assert.equal(calls.length,1);
});
test('exact-document review independently rejects unsafe and inapplicable sources',async()=>{
 const doc={...green,ordinal:-1,completeDocument:true,content:'Abra o painel.\nConfirme a emissão.'};
 const decision={versionIds:[doc.versionId],sufficiency:'sufficient'} as const;
 const calls:any[]=[];
 const result=await verifySourceAlignedProcedure(scripted([assistant(JSON.stringify({verdict:'unsupported',issue:'wrong_scope'}))],calls),
  'Procedimento de outro ambiente',doc.content,[doc,blue],1000,1000,()=>{},
  {versionIds:[...decision.versionIds],sufficiency:decision.sufficiency});
 assert.deepEqual(result,{verdict:'unsupported',reason:'model_rejected',issue:'wrong_scope'});
 assert.deepEqual(new Set(JSON.parse(calls[0].messages[1].content).evidence.map((s:any)=>s.versionId)),new Set([doc.versionId,blue.versionId]));
 const blocked=await verifySourceAlignedProcedure(scripted([]),'procedimento',doc.content,[{...doc,content:'Abra o painel.\nSenha: pessoal-privada'}],1000,1000,()=>{});
 assert.equal(blocked.verdict,'unsupported');
});
test('a partial source selection cannot mark unrelated or incomplete guidance as complete',async()=>{
 const doc={...green,ordinal:-1,completeDocument:true,content:'Abra o painel.\nConfirme a emissão.'};
 const partialSelection={versionIds:[doc.versionId],sufficiency:'partial'} as const;
 const selection={versionIds:[...partialSelection.versionIds],sufficiency:partialSelection.sufficiency};
 const supported=assistant(JSON.stringify({verdict:'supported',coverage:'partial',issue:'missing_coverage',claims:{u1:{kind:'current',refs:['e1s1']}}}));
 const result=await verifyGroundedAnswer(scripted([supported]),'Me dê o procedimento completo','Abra o painel.',[doc],1000,1000,undefined,selection,undefined,undefined,true);
 assert.equal(result.verdict,'supported');
 if(result.verdict==='supported')assert.notEqual(result.completeProcedureVerified,true);
 const wrongScope=assistant(JSON.stringify({verdict:'unsupported',coverage:'not_applicable',issue:'wrong_scope',claims:null}));
 assert.deepEqual(await verifyGroundedAnswer(scripted([wrongScope]),'Me dê o procedimento completo','Abra o painel.',[doc],1000,1000,undefined,selection,undefined,undefined,true),
  {verdict:'unsupported',reason:'model_rejected',issue:'wrong_scope'});
});

test('explicit complete mode takes precedence over conflicting focus and recovers a documented equipment-default step',async()=>{
 const doc={...green,ordinal:-1,completeDocument:true,content:'1. Abra o painel.\n2. Use a senha padrão demo-default.\n3. Confirme a opção.'};
 const calls:any[]=[];
 const result=await respond(actor,randomUUID(),'Me dê o passo a passo completo',[],scripted([
  tool('search_knowledge',{query:'controlador Verde procedimento'}),
  assistant('Abra o painel.'),
  assistant(JSON.stringify({verdict:'unsupported',coverage:'not_applicable',issue:'missing_coverage',claims:null})),
  assistant(JSON.stringify({verdict:'supported',issue:'none'}))
 ],calls),async()=>[doc],{semantic:semantic({mode:'complete',focused:true}),budget:plannedBudget(),verifyEvidence:true});
 assert.equal(result.metrics?.completeProcedureVerified,true);
 assert.equal(result.metrics?.sourceAlignedReviews,1);
 assert.equal(result.answer,doc.content+' [1]');
 assert.equal(calls.at(-1).response_format.json_schema.name,'source_aligned_review_v1');
 assert.deepEqual(result.sources[0].excerpts,[doc.content]);
});
