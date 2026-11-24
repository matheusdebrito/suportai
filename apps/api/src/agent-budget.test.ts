import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AgentBudget,DEFAULT_AGENT_LIMITS,normalizedSearchKey,resolveAgentLimits} from './agent-budget.js';
import type {Source} from './retrieval.js';

const fictional:Source={documentId:'document-ficticio',versionId:'version-ficticia',
 versionNumber:1,ordinal:0,title:'Zebra ZD230',content:'Calibrar etiquetas sintéticas',score:0.9};

test('agent limits default to 8 steps and 5 searches and cannot be configured as unlimited',()=>{
 assert.equal(DEFAULT_AGENT_LIMITS.maxSteps,8);
 assert.equal(DEFAULT_AGENT_LIMITS.maxSearches,5);
 assert.equal(resolveAgentLimits({AGENT_MAX_STEPS:'999999',AGENT_MAX_RAG_SEARCHES:'999999'}).maxSteps,12);
 assert.equal(resolveAgentLimits({AGENT_MAX_STEPS:'-1',AGENT_MAX_RAG_SEARCHES:'Infinity'}).maxSteps,8);
 assert.equal(resolveAgentLimits({AGENT_TIMEOUT_MS:'9999999'}).maxElapsedMs,90_000);
 assert.equal(resolveAgentLimits({AGENT_TOKENS_PER_CALL:'9999999'}).maxTokensPerCall,3_000);
 assert.equal(resolveAgentLimits({AGENT_MAX_STEPS:'4',AGENT_MAX_RAG_SEARCHES:'3'}).maxSteps,4);
});
test('model loop has eight steps, reserves the final step for synthesis and ends early',()=>{
 let now=1000;
 const budget=new AgentBudget(DEFAULT_AGENT_LIMITS,()=>now);
 const first=budget.startModelTurn();
 assert.ok(first);
 assert.equal(first.finalTurn,false);
 assert.equal(first.maxTokens,1800);
 assert.equal(first.timeoutMs,20000);
 budget.recordModelUsage({prompt_tokens:100,completion_tokens:20},300,50);
 assert.equal(budget.metrics('answered').steps,1);
 for(let i=1;i<8;i++){
  const step=budget.startModelTurn();
  assert.ok(step);
  assert.equal(step.finalTurn,i===7);
  budget.recordModelUsage({prompt_tokens:100,completion_tokens:20},300,50);
 }
 assert.equal(budget.startModelTurn(),null);
 assert.equal(budget.stopCause(),'step_budget');
 now+=61000;
 assert.equal(budget.stopCause(),'time_budget');
});
test('five distinct RAG searches maximum, duplicate lookup is cached without DB access',()=>{
 const budget=new AgentBudget();
 assert.equal(normalizedSearchKey('  ZD230   CALIBRAÇÃO  '),'zd230 calibração');
 assert.equal(budget.lookup('ZD230 calibração').kind,'new');
 budget.recordSearch('ZD230 calibração',[fictional]);
 const second=budget.lookup('  zd230   calibração  ');
 assert.equal(second.kind,'cached');
 if(second.kind==='cached')assert.deepEqual(second.items,[fictional]);
 assert.equal(budget.searches,1);
 for(let i=1;i<5;i++){
  const name='busca '+i;
  assert.equal(budget.lookup(name).kind,'new');
  budget.recordSearch(name,[]);
 }
 assert.equal(budget.searches,5);
 assert.equal(budget.lookup('nova busca').kind,'exhausted');
 assert.equal(budget.lookup('zd230 calibração').kind,'cached');
 assert.equal(budget.lookup('zd230 calibração').kind,'repeated_limit');
 assert.equal(budget.metrics('repeated_search').repeatedSearches,3);
 assert.equal(budget.shouldFinishAfterTools(),true);
});
test('failed searches cannot trigger retry storms or expose backend errors in metrics',()=>{
 const budget=new AgentBudget();
 assert.equal(budget.lookup('DNS').kind,'new');
 budget.recordSearch('DNS',null);
 assert.equal(budget.lookup('dns').kind,'error');
 assert.equal(budget.lookup('VPN').kind,'new');
 budget.recordSearch('VPN',null);
 assert.equal(budget.lookup('NTP').kind,'exhausted');
 const info=budget.metrics('search_unavailable');
 assert.equal(info.searchFailures,2);
 assert.equal(info.searches,2);
 assert.doesNotMatch(JSON.stringify(info),/password|consulta|DNS|VPN/i);
});
test('the wall-clock budget and token budgets stop further model calls',()=>{
 let now=0;
 const config={...DEFAULT_AGENT_LIMITS,maxElapsedMs:60000,maxCompletionTokens:2000,maxTotalTokens:5000};
 const timed=new AgentBudget(config,()=>now);
 assert.ok(timed.startModelTurn());
 now=59500;
 assert.equal(timed.startModelTurn(),null);
 assert.equal(timed.stopCause(),'time_budget');
 const tokens=new AgentBudget(config);
 assert.ok(tokens.startModelTurn());
 tokens.recordModelUsage({prompt_tokens:1000,completion_tokens:1950},20,20);
 assert.equal(tokens.startModelTurn(),null);
 assert.equal(tokens.stopCause(),'token_budget');
 assert.equal(tokens.metrics('token_budget').completionTokens,1950);
});
test('missing provider usage is estimated, never interpreted as zero-cost',()=>{
 const budget=new AgentBudget();
 assert.ok(budget.startModelTurn());
 budget.recordModelUsage(undefined,1200,120);
 const metrics=budget.metrics('answered');
 assert.ok(metrics.promptTokens>0);
 assert.ok(metrics.completionTokens>0);
 assert.equal(Object.keys(metrics).some(key=>/text|question|document|source/i.test(key)),false);
});
