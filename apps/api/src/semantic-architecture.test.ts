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
import {verifyGroundedAnswer} from './agent-verifier.js';

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
