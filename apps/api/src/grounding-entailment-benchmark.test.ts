import {test} from 'node:test';
import assert from 'node:assert/strict';
import type OpenAI from 'openai';
import {benchmarkEntailment,entailmentCases,measureEntailmentBenchmark} from './grounding-entailment-benchmark.js';

test('entailment challenge keeps independent labels and counts both classes of error and unavailable',()=>{
 assert.equal(entailmentCases.length,10);
 assert.equal(entailmentCases.filter(c=>c.shouldAccept).length,5);
 assert.equal(new Set(entailmentCases.map(c=>c.id)).size,10);
 assert.deepEqual(measureEntailmentBenchmark([
  {id:'a',shouldAccept:true,status:'unsupported'},
  {id:'b',shouldAccept:false,status:'supported'},
  {id:'c',shouldAccept:true,status:'unavailable'}
 ]),{cases:3,falseAcceptances:1,falseRejections:1,unavailable:1});
});
test('entailment benchmark exercises the independent contract for every case, not a prefilled result',async()=>{
 let calls=0;
 const provider={chat:{completions:{create:async(request:any)=>{
  const data=JSON.parse(request.messages[1].content);
  const item=entailmentCases[calls++];
  assert.equal(request.response_format.json_schema.name,'grounding_entailment_v1');
  assert.deepEqual(data,[{key:'u1',statement:item.statement,quotes:item.quotes}]);
  return {choices:[{message:{content:JSON.stringify({u1:item.shouldAccept?'entailed':'unsupported'})},finish_reason:'stop'}],usage:{prompt_tokens:20,completion_tokens:5}};
 }}}} as unknown as OpenAI;
 const report=await benchmarkEntailment(provider);
 assert.equal(calls,10);assert.equal(report.complete,true);
 assert.deepEqual(report.metrics,{cases:10,falseAcceptances:0,falseRejections:0,unavailable:0});
});
