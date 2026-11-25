import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {withConversationTurnLock} from './conversation-lock.js';

test('concurrent turns in the same conversation fail fast instead of reading stale history',
 {skip:!process.env.DATABASE_URL,timeout:15_000},async()=>{
  const id=randomUUID();
  let entered!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;});
  let release!:()=>void;
  const block=new Promise<void>(resolve=>{release=resolve;});
  const first=withConversationTurnLock(id,async()=>{
   entered();await block;return 'primeira resposta';
  });
  await started;
  try{
   const second=await withConversationTurnLock(id,async()=>{throw new Error('Nunca pode iniciar');});
   assert.equal(second.busy,true);
   assert.ok(typeof second.retryAfterMs==='number' && second.retryAfterMs>0);
   const independent=await withConversationTurnLock(randomUUID(),async()=> 'outra conversa');
   assert.deepEqual(independent,{busy:false,value:'outra conversa'});
  }finally{release();}
  assert.deepEqual(await first,{busy:false,value:'primeira resposta'});
  const after=await withConversationTurnLock(id,async()=> 'liberado');
  assert.deepEqual(after,{busy:false,value:'liberado'});
 });
test('advisory lock is released after a failed agent turn',
 {skip:!process.env.DATABASE_URL,timeout:15_000},async()=>{
  const id=randomUUID();
  await assert.rejects(withConversationTurnLock(id,async()=>{
   throw new Error('Falha sintética');
  }),/Falha sintética/);
  assert.deepEqual(await withConversationTurnLock(id,async()=>42),{busy:false,value:42});
 });
