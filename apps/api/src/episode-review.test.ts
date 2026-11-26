import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeReviews,type TurnReview} from './episode-review.js';
import {buildEpisodeBaseline} from './episode-baseline.js';
const row:TurnReview={episodeId:'phone',turn:1,correct:true,accepted:true,fallback:false,naturalBeforeFallback:true,unnecessaryWarning:false,contextMaintained:true,repeatedQuestion:false,directAnswer:true,appropriateNextStep:true,completeWhenRequested:true,authorizedSources:true,secretLeak:false};
test('review metrics distinguish false rejection and false acceptance',()=>{
 const result=summarizeReviews([{...row,accepted:false,fallback:true},{...row,turn:2,correct:false}]);
 assert.equal(result.falseRejections,1);assert.equal(result.falseAcceptances,1);assert.equal(result.degradedFallbacks,1);
 assert.throws(()=>summarizeReviews([row,row]));
});
test('baseline requires real report and complete human review',()=>{
 const report={mode:'real-http',model:'fixture',embeddingModel:'fixture',temperature:0,limits:{},corpusHash:'a'.repeat(64),commit:'b'.repeat(40),turns:[{}]};
 assert.equal(buildEpisodeBaseline(report,[row]).criteriaMet,true);
 assert.throws(()=>buildEpisodeBaseline({...report,mode:'mock'},[row]));
 assert.throws(()=>buildEpisodeBaseline(report,[]));
});
