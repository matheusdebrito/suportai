import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import type {TurnCapture} from './episode-harness.js';
import type {episodeQuality} from './episode-quality.js';
import {summarizeReviews,type TurnReview} from './episode-review.js';
type Turn={message:string;quality:ReturnType<typeof episodeQuality>;capture?:TurnCapture|null};
type Report={mode:string;model:string;embeddingModel:string;temperature:number;limits:unknown;corpusHash:string;commit:string;turns:Turn[];ranking?:{recall:number|null;precision:number;mrr:number}};
type Labels={origin:'ai'|'human';rows:TurnReview[]};
function sumKnown(values:(number|undefined|null)[]):number|null{
 return values.length&&values.every(value=>typeof value==='number'&&Number.isFinite(value))?values.reduce<number>((sum,value)=>sum+Number(value),0):null;
}
function summarize(report:Report){
 const turns=report.turns;
 const captures=turns.map(t=>t.capture);
 const reviews=captures.flatMap(c=>c?.review??[]);
 const allCaptured=captures.length>0&&captures.every(Boolean);
 return {
  turns:turns.length,
  literalOverlap:turns.length?turns.reduce((s,t)=>s+t.quality.literalOverlap,0)/turns.length:null,
  repeatedLines:sumKnown(turns.map(t=>t.quality.repeatedLines)),
  boilerplate:sumKnown(turns.map(t=>Number(t.quality.boilerplate))),
  escapedMarkdown:sumKnown(turns.map(t=>Number(t.quality.escapedMarkdown))),
  partialWarnings:sumKnown(turns.map(t=>Number(t.quality.partialWarning))),
  recall:report.ranking?.recall??null,precision:report.ranking?.precision??null,mrr:report.ranking?.mrr??null,
  verifierChecks:allCaptured?sumKnown(captures.map(c=>c?.agentMetrics.verifierChecks)):null,
  verifierRejections:allCaptured?sumKnown(captures.map(c=>c?.agentMetrics.verifierRejections)):null,
  claimShape:allCaptured&&captures.every(c=>c?.agentMetrics.verifierFailures!==undefined)?sumKnown(captures.map(c=>c?.agentMetrics.verifierFailures?.claim_shape??0)):null,
  schemaInvalid:allCaptured&&captures.every(c=>c?.agentMetrics.verifierFailures!==undefined)?sumKnown(captures.map(c=>c?.agentMetrics.verifierFailures?.schema_invalid??0)):null,
  fallbacks:allCaptured?sumKnown(captures.map(c=>c?.agentMetrics.literalFallbacks)):null,
  durationMs:allCaptured?sumKnown(captures.map(c=>c?.agentMetrics.durationMs)):null,
  promptTokens:allCaptured?sumKnown(captures.map(c=>c?.agentMetrics.promptTokens)):null,
  completionTokens:allCaptured?sumKnown(captures.map(c=>c?.agentMetrics.completionTokens)):null,
  verifierDurationMs:allCaptured&&reviews.length?sumKnown(reviews.map(r=>r.durationMs)):null,
  verifierPromptTokens:allCaptured&&reviews.length&&reviews.every(r=>r.usageObserved)?sumKnown(reviews.map(r=>r.promptTokens)):null,
  verifierCompletionTokens:allCaptured&&reviews.length&&reviews.every(r=>r.usageObserved)?sumKnown(reviews.map(r=>r.completionTokens)):null
 };
}
export function compareEpisodeReports(baseline:Report,current:Report,baselineLabels?:Labels,currentLabels?:Labels){
 const mismatches:string[]=[];
 for(const key of ['mode','model','embeddingModel','temperature','limits','corpusHash'] as const)if(!isDeepStrictEqual(baseline[key],current[key]))mismatches.push(key);
 if(baseline.mode!=='real-http'||current.mode!=='real-http')mismatches.push('not_matched_real_http');
 if(!isDeepStrictEqual(baseline.turns.map(t=>t.message),current.turns.map(t=>t.message)))mismatches.push('messages');
 if(!baseline.turns.length||!current.turns.length)mismatches.push('empty_episode');
 if(!baseline.commit||!current.commit)mismatches.push('missing_commit');
 const previous=summarize(baseline),next=summarize(current);
 const delta=Object.fromEntries(Object.entries(previous).map(([key,value])=>{
  const after=next[key as keyof typeof next];return [key,!mismatches.length&&typeof value==='number'&&typeof after==='number'?after-value:null];
 }));
 let reviewed:null|{origin:Labels['origin'];previous:ReturnType<typeof summarizeReviews>;current:ReturnType<typeof summarizeReviews>;falseRejectionDelta:number}=null;
 const covers=(labels:Labels,report:Report)=>labels.rows.length===report.turns.length&&new Set(labels.rows.map(r=>r.episodeId)).size===1&&labels.rows.every(r=>r.turn<=report.turns.length);
 if(!mismatches.length&&baselineLabels&&currentLabels&&baselineLabels.origin===currentLabels.origin&&covers(baselineLabels,baseline)&&covers(currentLabels,current)){
  const before=summarizeReviews(baselineLabels.rows),after=summarizeReviews(currentLabels.rows);
  reviewed={origin:currentLabels.origin,previous:before,current:after,falseRejectionDelta:after.falseRejections-before.falseRejections};
 }
 return {schemaVersion:1,baselineCommit:baseline.commit,currentCommit:current.commit,comparable:mismatches.length===0,mismatches,baseline:previous,current:next,delta,reviewed,
  notes:['Null means unavailable or not comparable, never zero.','Proxy metrics are not evidence of semantic correctness.','Historical AI labels do not establish human homologation.','The original baseline lacks per-turn telemetry; verifier and latency reductions cannot be established from it.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [previous,current,output,previousLabels,currentLabels,origin]=process.argv.slice(2);
 if(!previous||!current||!output)throw new Error('Usage: episode-compare <baseline-report> <current-report> <output> [baseline-labels current-labels ai|human]');
 const read=(file:string)=>JSON.parse(readFileSync(file,'utf8'));
 if((previousLabels||currentLabels||origin)&&(!previousLabels||!currentLabels||!['ai','human'].includes(origin)))throw new Error('Provide both label files and their shared explicit origin');
 writeFileSync(output,JSON.stringify(compareEpisodeReports(read(previous),read(current),previousLabels?{origin:origin as Labels['origin'],rows:read(previousLabels)}:undefined,currentLabels?{origin:origin as Labels['origin'],rows:read(currentLabels)}:undefined),null,2));
}
