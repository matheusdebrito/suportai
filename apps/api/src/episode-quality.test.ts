import {test} from 'node:test';
import assert from 'node:assert/strict';
import {episodeQuality,retrievalMetrics} from './episode-quality.js';
test('retrieval metrics deduplicate document versions',()=>{
 assert.deepEqual(retrievalMetrics(['a','b'],['x','a','a']),{recall:0.5,precision:0.5,mrr:0.5});
});
test('quality flags are observable proxies, not semantic verdicts',()=>{
 const text='Encontrei um procedimento para configurar o telefone.';
 const q=episodeQuality(text,text,[text]);
 assert.equal(q.literalOverlap,1);assert.equal(q.repeatedLines,1);assert.equal(q.boilerplate,true);
});
