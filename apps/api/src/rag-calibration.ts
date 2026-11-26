import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {rerankKnowledgeCandidates,DEFAULT_RERANK_POLICY,type Candidate,type RerankPolicy} from './retrieval.js';
import {retrievalMetrics} from './episode-quality.js';
type Case={id:string;query:string;expected:string[];candidates:Candidate[];split:'pilot'|'holdout'};
export function calibrate(cases:Case[],policies:RerankPolicy[]){
 if(!policies.length||policies.some(p=>!Number.isFinite(p.semanticMinimum)||p.semanticMinimum<0||p.semanticMinimum>1||!Number.isFinite(p.diversityPenalty)||p.diversityPenalty<0))throw new Error('Invalid policies');
 if(!cases.some(c=>c.split==='pilot')||!cases.some(c=>c.split==='holdout'))throw new Error('Pilot and holdout cases required');
 if(cases.some(c=>!c.expected.length)||new Set(cases.map(c=>c.id)).size!==cases.length)throw new Error('Invalid reviewed corpus');
 const evaluate=(policy:RerankPolicy,split:Case['split'])=>{
  const rows=cases.filter(c=>c.split===split).map(c=>({id:c.id,...retrievalMetrics(c.expected,rerankKnowledgeCandidates(c.query,c.candidates,5,policy).map(x=>x.versionId))}));
  return {rows,recall:rows.reduce((s,r)=>s+(r.recall??0),0)/rows.length,precision:rows.reduce((s,r)=>s+r.precision,0)/rows.length,mrr:rows.reduce((s,r)=>s+r.mrr,0)/rows.length};
 };
 const pilot=policies.map(policy=>({policy,...evaluate(policy,'pilot')})).sort((a,b)=>b.recall-a.recall||b.mrr-a.mrr||b.precision-a.precision);
 const selected=pilot[0]?.policy??DEFAULT_RERANK_POLICY;
 return {pilot,selected,holdout:evaluate(selected,'holdout'),baseline:evaluate(DEFAULT_RERANK_POLICY,'holdout'),applied:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href&&process.argv[2]&&process.argv[3]){
 const cases=JSON.parse(readFileSync(process.argv[2],'utf8')) as Case[];
 const policies=[DEFAULT_RERANK_POLICY,...[0.5,0.6,0.65].flatMap(semanticMinimum=>[0.12,0.18,0.24].map(diversityPenalty=>({semanticMinimum,diversityPenalty})))];
 writeFileSync(process.argv[3],JSON.stringify(calibrate(cases,policies),null,2));
}
