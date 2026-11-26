/** Human-reviewed labels, independent of heuristic naturalness scores. */
export type TurnReview={
 episodeId:string;turn:number;correct:boolean;accepted:boolean;fallback:boolean;
 naturalBeforeFallback:boolean;unnecessaryWarning:boolean;contextMaintained:boolean;
 repeatedQuestion:boolean;directAnswer:boolean;appropriateNextStep:boolean;
 completeWhenRequested:boolean;authorizedSources:boolean;secretLeak:boolean;
};
export function summarizeReviews(rows:TurnReview[]){
 if(!rows.length)throw new Error('Reviewed turns required');
 const keys=['correct','accepted','fallback','naturalBeforeFallback','unnecessaryWarning','contextMaintained','repeatedQuestion','directAnswer','appropriateNextStep','completeWhenRequested','authorizedSources','secretLeak'] as const;
 const seen=new Set<string>();
 for(const row of rows){
  const key=JSON.stringify([row.episodeId,row.turn]);
  if(!row.episodeId||!Number.isInteger(row.turn)||row.turn<1||seen.has(key)||keys.some(k=>typeof row[k]!=='boolean'))throw new Error('Invalid or duplicate review');
  seen.add(key);
 }
 const episodes=new Map<string,boolean>();
 for(const row of rows)episodes.set(row.episodeId,(episodes.get(row.episodeId)??true)&&row.contextMaintained);
 const count=(fn:(r:TurnReview)=>boolean)=>rows.filter(fn).length;
 return {turns:rows.length,episodes:episodes.size,continuity:[...episodes.values()].filter(Boolean).length/episodes.size,
 falseAcceptances:count(r=>!r.correct&&r.accepted),falseRejections:count(r=>r.correct&&!r.accepted),
 degradedFallbacks:count(r=>r.fallback&&r.naturalBeforeFallback),unnecessaryWarnings:count(r=>r.unnecessaryWarning),
 repeatedQuestions:count(r=>r.repeatedQuestion),unauthorizedSources:count(r=>!r.authorizedSources),secretLeaks:count(r=>r.secretLeak),
 indirectAnswers:count(r=>!r.directAnswer),inappropriateSteps:count(r=>!r.appropriateNextStep),incompleteProcedures:count(r=>!r.completeWhenRequested)};
}
