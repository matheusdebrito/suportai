import {respond,type AgentOptions,type AgentOutput} from './agent.js';
import {searchKnowledge,type Source} from './retrieval.js';
import {retrievalMetrics} from './episode-quality.js';
export type RetrievalTrace={ranked:{versionId:string;ordinal:number;score:number}[];metrics:ReturnType<typeof retrievalMetrics>};
export type TurnCapture={agentMetrics:NonNullable<AgentOutput['metrics']>;retrieval:RetrievalTrace[];review:NonNullable<AgentOptions['evaluationObserver']> extends (value:infer T)=>void?T[]:never};
export function createEpisodeCapture(expected:()=>string[],allowed:()=>ReadonlySet<string>){
 if(process.env.NODE_ENV!=='test'||!process.env.TEST_DATABASE_URL||process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw new Error('Evaluation capture requires an isolated test database');
 let captured:TurnCapture|undefined;
 const agentResponder:typeof respond=async(actor,conversation,message,history,provider,search=searchKnowledge,options)=>{
  if(captured)throw new Error('Previous turn capture not consumed');
  const retrieval:RetrievalTrace[]=[];
  const review:TurnCapture['review']=[];
  const output=await respond(actor,conversation,message,history,provider,async(a,q,limit)=>{
   const sources:Source[]=await search(a,q,limit);
   if(sources.some(s=>!allowed().has(s.versionId)))throw new Error('Non-fixture retrieval encountered');
   retrieval.push({ranked:sources.map(s=>({versionId:s.versionId,ordinal:s.ordinal,score:s.score})),metrics:retrievalMetrics(expected(),sources.map(s=>s.versionId))});
   return sources;
  },{...options,evaluationObserver:event=>review.push(event)});
  if(!output.metrics)throw new Error('Real agent metrics unavailable');
  if(output.sources.some(s=>!allowed().has(s.versionId)))throw new Error('Non-fixture final source encountered');
  captured={agentMetrics:output.metrics,retrieval,review};
  return output;
 };
 return {agentResponder,take(){const result=captured;captured=undefined;return result;}};
}
