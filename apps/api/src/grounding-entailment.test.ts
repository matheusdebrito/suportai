import {test} from 'node:test';
import assert from 'node:assert/strict';
import type OpenAI from 'openai';
import {AgentBudget,DEFAULT_AGENT_LIMITS} from './agent-budget.js';
import {sameDocumentedStatement,parseEntailment,reviewEntailment,entailmentFormat,type EntailmentUnit} from './grounding-entailment.js';
const units:EntailmentUnit[]=[
 {unit:2,statement:'Verifique a luz indicadora.',quotes:['Confira a luz de estado.']},
 {unit:4,statement:'Uma falha do motor explica a luz apagada.',quotes:['Confira a luz de estado.']}
];
const provider=(content:string,calls:any[]=[])=>({chat:{completions:{create:async(request:any)=>{
 calls.push(request);
 return {choices:[{message:{content},finish_reason:'stop'}],usage:{prompt_tokens:30,completion_tokens:12}};
}}}}) as unknown as OpenAI;
test('literal equivalence normalizes formatting but not changes in facts or conditions',()=>{
 assert.equal(sameDocumentedStatement('Confira a luz de estado.','1. Confira a luz de estado.'),true);
 assert.equal(sameDocumentedStatement('Abra o painel.','Não abra o painel.'),false);
 assert.equal(sameDocumentedStatement('Valor: Ativo','Valor: ativo'),false);
 assert.equal(sameDocumentedStatement('Abra o painel.','Abra o painel. Depois, confira a trava.'),false);
});
test('entailment contract is strict, complete and keyed by server units',()=>{
 assert.deepEqual(entailmentFormat(units).json_schema.schema.required,['u2','u4']);
 assert.deepEqual(parseEntailment({u2:'entailed',u4:'unsupported'},units),['entailed','unsupported']);
 for(const raw of [{u2:'entailed'},{u2:'entailed',u4:'entailed',extra:true},{u2:'entailed',u4:'yes'},null])
  assert.equal(parseEntailment(raw,units),null);
});
test('independent audit rejects unsupported causal claims even if adjacent paraphrases are faithful',async()=>{
 const calls:any[]=[],budget=new AgentBudget();
 const result=await reviewEntailment(provider(JSON.stringify({u2:'entailed',u4:'unsupported'}),calls),budget,units);
 assert.deepEqual(result,{status:'unsupported',attempted:true,rejectedUnits:[4],usageObserved:true});
 assert.equal(budget.steps,1);assert.equal(budget.promptTokens,30);assert.equal(budget.completionTokens,12);
 assert.deepEqual(JSON.parse(calls[0].messages[1].content),units.map(u=>({key:'u'+u.unit,statement:u.statement,quotes:u.quotes})));
});
test('incomplete or unavailable audit fails closed and consumes no unallocated model call',async()=>{
 const calls:any[]=[],budget=new AgentBudget({...DEFAULT_AGENT_LIMITS,maxSteps:1});
 assert.deepEqual(await reviewEntailment(provider('{}',calls),budget,units),{status:'unavailable',attempted:true,rejectedUnits:[],usageObserved:true});
 assert.deepEqual(await reviewEntailment(provider('{}',calls),budget,units),{status:'unavailable',attempted:false,rejectedUnits:[],usageObserved:false});
 assert.equal(calls.length,1);
});
