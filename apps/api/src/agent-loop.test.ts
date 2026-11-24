import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type OpenAI from 'openai';
import type {Actor} from './security.js';
import type {Source} from './retrieval.js';
import {respond} from './agent.js';

const actor:Actor={id:randomUUID(),role:'USER',auth_revision:1,must_change_password:false};
const source:Source={documentId:randomUUID(),versionId:randomUUID(),
 versionNumber:1,ordinal:0,title:'Manual fictício',content:'Procedimento sintético de diagnóstico DNS.',score:0.9};
const tool=(name:string,args:unknown,id:string)=>({
 id,type:'function' as const,function:{name,arguments:JSON.stringify(args)}
});
function fakeModel(queue:any[],calls:any[]):OpenAI{
 return {chat:{completions:{create:async(request:any,options:any)=>{
  calls.push({request,options});
  const response=queue.shift();
  if(!response)throw new Error('Model called more often than expected');
  if(response instanceof Error)throw response;
  return {choices:[{message:response.message??response,finish_reason:response.finish_reason??'stop'}],
   usage:response.usage};
 }}}} as unknown as OpenAI;
}
test('simple question finishes after one RAG lookup and one synthesis (not eight calls)',async()=>{
 const calls:any[]=[];let reads=0;
 const model=fakeModel([
  {role:'assistant',content:null,tool_calls:[tool('search_knowledge',{query:'diagnóstico DNS'},'q1')]},
  {role:'assistant',content:'Consulte o procedimento de diagnóstico DNS.'}
 ],calls);
 const output=await respond(actor,randomUUID(),'O DNS tá ruim, que faço?',[],model,
  async()=>{reads++;return [source];});
 assert.equal(reads,1);
 assert.equal(calls.length,2);
 assert.equal(output.metrics?.steps,2);
 assert.equal(output.metrics?.searches,1);
 assert.equal(output.metrics?.stopReason,'answered');
 assert.equal(output.sources[0].versionId,source.versionId);
 assert.equal(calls[0].request.tool_choice,'required');
 assert.equal(calls[1].request.tool_choice,'auto');
 assert.ok(calls[0].options.timeout<=20_000);
});
test('five RAG lookups trigger a final synthesis call with tools disabled',async()=>{
 const calls:any[]=[];const searches:string[]=[];
 const queue=Array.from({length:5},(_,i)=>({
  role:'assistant',content:null,tool_calls:[tool('search_knowledge',{query:'procedimento '+(i+1)},'q'+i)]
 }));
 queue.push({role:'assistant',content:'Não encontrei o procedimento; informe o ambiente.'});
 const output=await respond(actor,randomUUID(),'Preciso investigar a rede interna',[],
  fakeModel(queue,calls),async(_actor,query)=>{searches.push(query);return [];});
 assert.equal(searches.length,5);
 assert.equal(calls.length,6);
 assert.equal(calls[5].request.tool_choice,'none');
 assert.equal(output.metrics?.searches,5);
 assert.equal(output.metrics?.stopReason,'no_evidence');
 assert.match(output.answer,/não encontrei fontes publicadas/i);
});
test('duplicate searches are served from cache and the model must eventually synthesize',async()=>{
 const calls:any[]=[];let reads=0;
 const queue=Array.from({length:3},(_,i)=>({
  role:'assistant',content:null,
  tool_calls:[tool('search_knowledge',{query:i===0?'Pesquisa DNS':'  pesquisa   dns  '},'q'+i)]
 }));
 queue.push({role:'assistant',content:'O manual fictício descreve o diagnóstico de DNS.'});
 const output=await respond(actor,randomUUID(),'Como investigar o DNS?',[],
  fakeModel(queue,calls),async()=>{reads++;return [source];});
 assert.equal(reads,1,'Identical normalized searches must not hit DB again');
 assert.equal(calls[3].request.tool_choice,'none');
 assert.equal(output.metrics?.searches,1);
 assert.equal(output.metrics?.repeatedSearches,2);
 assert.equal(output.metrics?.steps,4);
});
test('the eighth iteration forbids tool execution even if the model attempts it',async()=>{
 const calls:any[]=[];let reads=0;
 const queue=Array.from({length:8},(_,i)=>({
  role:'assistant',content:null,tool_calls:[tool('search_knowledge',{query:'consulta única '+i},'q'+i)]
 }));
 const output=await respond(actor,randomUUID(),'Me ajude no diagnóstico',[],
  fakeModel(queue,calls),async()=>{reads++;return [];});
 assert.equal(reads,5,'The backend caps distinct knowledge searches');
 assert.ok(calls.length<=8);
 assert.equal(calls.at(-1).request.tool_choice,'none');
 assert.equal(output.metrics?.stopReason,'step_budget');
 assert.deepEqual(output.sources,[]);
});
test('reported model token usage can prohibit tool execution before side effects',async()=>{
 const calls:any[]=[];let reads=0;
 const model=fakeModel([{
  message:{role:'assistant',content:null,tool_calls:[
   tool('search_knowledge',{query:'query'},'q1')]},
  usage:{prompt_tokens:25000,completion_tokens:10000}
 }],calls);
 const output=await respond(actor,randomUUID(),'Tenho problema de DNS',[],model,
  async()=>{reads++;return [source];});
 assert.equal(reads,0);
 assert.equal(output.metrics?.stopReason,'token_budget');
 assert.deepEqual(output.sources,[]);
});
test('a model API failure never leaks provider errors or fabricates citations',async()=>{
 const calls:any[]=[];
 const model=fakeModel([new Error('OPENAI_API_KEY=do-not-show-me SQL_PASSWORD=secret')],calls);
 const output=await respond(actor,randomUUID(),'Como consertar a VPN?',[],model,
  async()=>[source]);
 assert.equal(output.metrics?.stopReason,'provider_failure');
 assert.deepEqual(output.sources,[]);
 assert.doesNotMatch(output.answer,/OPENAI_API_KEY|SQL_PASSWORD|secret/i);
});
test('failed RAG query is not retried verbatim and second independent failure ends search',async()=>{
 let reads=0;const calls:any[]=[];
 const model=fakeModel([
  {role:'assistant',content:null,tool_calls:[tool('search_knowledge',{query:'VPN'},'q1')]},
  {role:'assistant',content:null,tool_calls:[tool('search_knowledge',{query:'VPN'},'q2')]},
  {role:'assistant',content:null,tool_calls:[tool('search_knowledge',{query:'acesso remoto'},'q3')]},
  {role:'assistant',content:'O documento diz para alterar a configuração da VPN.'}
 ],calls);
 const output=await respond(actor,randomUUID(),'Como consertar o acesso VPN?',[],model,
  async()=>{reads++;throw new Error('SQL_PASSWORD=never-log');});
 assert.equal(reads,2);
 assert.equal(output.metrics?.searchFailures,2);
 assert.equal(output.metrics?.searches,2);
 assert.equal(output.metrics?.stopReason,'search_unavailable');
 assert.match(output.answer,/Não foi possível consultar a base/i);
 assert.doesNotMatch(JSON.stringify(output),/never-log|SQL_PASSWORD/);
});
test('clarification ends immediately and reports only numeric execution metadata',async()=>{
 const calls:any[]=[];
 const model=fakeModel([{role:'assistant',content:null,
  tool_calls:[tool('ask_clarification',{question:'Qual é o equipamento afetado?'},'q1')]}],calls);
 const output=await respond(actor,randomUUID(),'Tá quebrado aqui',[],model);
 assert.equal(output.metrics?.steps,1);
 assert.equal(output.metrics?.stopReason,'clarified');
 assert.equal(output.metrics?.searches,0);
 assert.equal(output.answer,'Qual é o equipamento afetado?');
 assert.equal(typeof output.metrics?.durationMs,'number');
});
