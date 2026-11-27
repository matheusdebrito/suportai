import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareEpisodeReports} from './episode-compare.js';
const quality={literalOverlap:0,repeatedLines:0,boilerplate:false,escapedMarkdown:false,partialWarning:false,sentenceCount:1};
const report={mode:'real-http',model:'fixture',embeddingModel:'fixture',temperature:0.2,limits:{},corpusHash:'fixture',commit:'baseline',turns:[{message:'consulta',quality}]};
test('comparison never interprets missing historical telemetry as zero',()=>{
 const result=compareEpisodeReports(report,{...report,commit:'current',turns:[{message:'consulta',quality:{...quality,repeatedLines:1}}]});
 assert.equal(result.comparable,true);
 assert.equal(result.baseline.claimShape,null);assert.equal(result.delta.claimShape,null);assert.equal(result.delta.durationMs,null);
 assert.equal(result.delta.repeatedLines,1);assert.equal(result.reviewed,null);
});
test('comparison refuses deltas across different model, corpus or messages',()=>{
 const result=compareEpisodeReports(report,{...report,model:'other',corpusHash:'other',turns:[{message:'different',quality}]});
 assert.equal(result.comparable,false);assert.deepEqual(result.mismatches,['model','corpusHash','messages']);assert.equal(result.delta.repeatedLines,null);
});

test('comparison refuses equally truncated episodes and incomplete declared coverage',()=>{
 const result=compareEpisodeReports({...report,complete:false,expectedTurnCount:5},{...report,commit:'current',complete:false,expectedTurnCount:5});
 assert.equal(result.comparable,false);
 assert.ok(result.mismatches.includes('incomplete_episode'));
 assert.equal(result.delta.repeatedLines,null);
});
