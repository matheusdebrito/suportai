import type {Source} from './retrieval.js';
import type {GroundingFailure} from './agent-verifier.js';

export type AgentLimits={
 maxSteps:number;
 maxSearches:number;
 maxToolsPerStep:number;
 maxSources:number;
 maxElapsedMs:number;
 maxTokensPerCall:number;
 maxCompletionTokens:number;
 maxTotalTokens:number;
 maxRepeatedSearches:number;
 maxSearchFailures:number;
};
export type AgentStopReason=
 'answered'|'clarified'|'no_evidence'|'model_interrupted'|'unsafe_answer'|
 'provider_failure'|'search_unavailable'|'step_budget'|'time_budget'|
 'token_budget'|'repeated_search'|'tool_budget'|'read_timeout'|'model_timeout'|'source_inaccessible'|'source_conflict'|'other';
export type AgentMetrics={
 steps:number;searches:number;repeatedSearches:number;searchFailures:number;
 toolCalls:number;promptTokens:number;completionTokens:number;
 durationMs:number;stopReason:AgentStopReason;
 verifierChecks?:number;verifierRejections?:number;recoverySearches?:number;literalFallbacks?:number;lastVerifierFailure?:GroundingFailure;
 adaptiveRewrites?:number;nonclaimsRemoved?:number;unsupportedUnits?:number;supportPreference?:'adaptive'|'guided'|'complete';
};

/** Limits are deliberately bounded; operators cannot configure unlimited agent calls. */
export const DEFAULT_AGENT_LIMITS:AgentLimits={
 maxSteps:8,maxSearches:5,maxToolsPerStep:4,maxSources:12,
 maxElapsedMs:60_000,maxTokensPerCall:1_800,
 maxCompletionTokens:9_000,maxTotalTokens:40_000,
 maxRepeatedSearches:2,maxSearchFailures:2
};
function boundedInt(raw:string|undefined,fallback:number,min:number,max:number):number{
 if(!raw||!/^[0-9]+$/.test(raw))return fallback;
 const n=Number(raw);
 return Number.isSafeInteger(n)?Math.min(max,Math.max(min,n)):fallback;
}
export function resolveAgentLimits(env:Record<string,string|undefined>=process.env):AgentLimits{
 return {
  ...DEFAULT_AGENT_LIMITS,
  maxSteps:boundedInt(env.AGENT_MAX_STEPS,8,2,12),
  maxSearches:boundedInt(env.AGENT_MAX_RAG_SEARCHES,5,1,8),
  maxElapsedMs:boundedInt(env.AGENT_TIMEOUT_MS,60_000,15_000,90_000),
  maxTokensPerCall:boundedInt(env.AGENT_TOKENS_PER_CALL,1_800,512,3_000),
  maxCompletionTokens:boundedInt(env.AGENT_COMPLETION_TOKEN_BUDGET,9_000,2_000,16_000),
  maxTotalTokens:boundedInt(env.AGENT_TOTAL_TOKEN_BUDGET,40_000,5_000,80_000)
 };
}
export function normalizedSearchKey(value:string):string{
 return value.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
}
type CachedSearch={kind:'ok';items:Source[]}|{kind:'error'};

/**
 * A per-message, deterministic execution budget. Never store user content,
 * documents or credentials in metrics/logging.
 */
export class AgentBudget{
 readonly limits:AgentLimits;
 private readonly started:number;
 private readonly now:()=>number;
 private readonly searchesByQuery=new Map<string,CachedSearch>();
 steps=0;
 searches=0;
 repeatedSearches=0;
 searchFailures=0;
 toolCalls=0;
 promptTokens=0;
 completionTokens=0;
 constructor(limits:AgentLimits=resolveAgentLimits(),now:()=>number=Date.now){
  this.limits=limits;this.now=now;this.started=now();
 }
 remainingMs():number{return Math.max(0,this.limits.maxElapsedMs-(this.now()-this.started));}
 stopCause():AgentStopReason|null{
  if(this.remainingMs()<1_000)return 'time_budget';
  if(this.steps>=this.limits.maxSteps)return 'step_budget';
  if(this.limits.maxCompletionTokens-this.completionTokens<256||
     this.limits.maxTotalTokens-this.promptTokens-this.completionTokens<256)return 'token_budget';
  return null;
 }
 startModelTurn(forceFinal=false):{maxTokens:number;timeoutMs:number;finalTurn:boolean}|null{
  if(this.stopCause())return null;
  const maxTokens=Math.min(
   this.limits.maxTokensPerCall,
   this.limits.maxCompletionTokens-this.completionTokens,
   this.limits.maxTotalTokens-this.promptTokens-this.completionTokens
  );
  if(maxTokens<256)return null;
  this.steps++;
  return {
   maxTokens,
   timeoutMs:Math.max(1_000,Math.min(20_000,this.remainingMs()-250)),
   finalTurn:forceFinal||this.steps===this.limits.maxSteps
  };
 }
 recordModelUsage(usage:{prompt_tokens?:number|null;completion_tokens?:number|null}|undefined,
                   promptCharacters:number,responseCharacters:number):void{
  // Test doubles and some providers do not expose usage. Estimates are
  // accounting guardrails, NOT accurate token counts or billing estimates.
  const estimate=(n:number)=>Math.max(1,Math.ceil(n/3));
  this.promptTokens+=usage?.prompt_tokens??estimate(promptCharacters);
  this.completionTokens+=usage?.completion_tokens??estimate(responseCharacters);
 }
 lookup(query:string):
  {kind:'new'}|{kind:'cached';items:Source[]}|{kind:'error'}|
  {kind:'exhausted'}|{kind:'repeated_limit'}{
  const key=normalizedSearchKey(query);
  const existing=this.searchesByQuery.get(key);
  if(existing){
   this.repeatedSearches++;
   if(this.repeatedSearches>this.limits.maxRepeatedSearches)return {kind:'repeated_limit'};
   return existing.kind==='error'?{kind:'error'}:{kind:'cached',items:existing.items};
  }
  if(this.searches>=this.limits.maxSearches)return {kind:'exhausted'};
  if(this.remainingMs()<1_000)return {kind:'exhausted'};
  if(this.searchFailures>=this.limits.maxSearchFailures)return {kind:'exhausted'};
  this.searches++;
  return {kind:'new'};
 }
 recordSearch(query:string,result:Source[]|null):void{
  this.searchesByQuery.set(normalizedSearchKey(query),
   result===null?{kind:'error'}:{kind:'ok',items:result});
  if(result===null)this.searchFailures++;
 }
 recordTool():void{this.toolCalls++;}
 shouldFinishAfterTools():boolean{
  return this.repeatedSearches>=this.limits.maxRepeatedSearches||
   this.searches>=this.limits.maxSearches||
   this.searchFailures>=this.limits.maxSearchFailures;
 }
 metrics(stopReason:AgentStopReason):AgentMetrics{
  return {
   steps:this.steps,searches:this.searches,repeatedSearches:this.repeatedSearches,
   searchFailures:this.searchFailures,toolCalls:this.toolCalls,
   promptTokens:this.promptTokens,completionTokens:this.completionTokens,
   durationMs:Math.max(0,this.now()-this.started),stopReason
  };
 }
}
