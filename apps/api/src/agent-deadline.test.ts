import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boundedRead} from './agent-deadline.js';

test('successful read resolves without waiting for the full deadline',async()=>{
 assert.equal(await boundedRead(Promise.resolve('resultado autorizado'),1000),'resultado autorizado');
});
test('stalled read has a bounded wait instead of hanging the agent',async()=>{
 const never=new Promise<never>(()=>{});
 await assert.rejects(boundedRead(never,15),/excedeu o prazo/i);
});
test('unavailable read fails with its original exception',async()=>{
 await assert.rejects(boundedRead(Promise.reject(new Error('falha sintética')),1000),/falha sintética/);
});
test('an expired deadline never starts waiting',async()=>{
 await assert.rejects(boundedRead(Promise.resolve('ok'),0),/excedeu o prazo/i);
});
