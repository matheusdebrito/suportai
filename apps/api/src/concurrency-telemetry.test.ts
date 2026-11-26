// Set NODE_ENV before importing server to prevent module-level server startup
process.env.NODE_ENV='test';

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,query} from './db.js';
import argon2 from 'argon2';
import {respond} from './agent.js';
import {actorForSession,hashToken} from './security.js';

// Dynamic import of buildApp AFTER NODE_ENV is set
const {buildApp} = await import('./server.js');

if(!process.env.TEST_DATABASE_URL){
  test('concurrency tests require TEST_DATABASE_URL',{skip:'No isolated PostgreSQL test database configured'},()=>{});
}else{
  if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL) throw new Error('Integration tests require DATABASE_URL to equal TEST_DATABASE_URL');

  test('H-T016: concurrency, idempotency, and operation scenarios',{timeout:45000},async()=>{
    const app=await buildApp({agentResponder:async(_a,_id,message)=>({answer:'Resposta: '+message,sources:[],pendingActions:[]})});
    const origin=process.env.APP_ORIGIN||'http://localhost:5173';
    const id=randomUUID().slice(0,8);

    async function createUser(role:'USER'|'ADMIN'|'APPROVER'){
      const email=`test-${id}-${role.toLowerCase()}@example.test`;
      const password=`SecureTestPassword!-${id}`;
      const r=await query('INSERT INTO users(email,password_hash,role) VALUES($1,$2,$3) RETURNING id',[email,await argon2.hash(password),role]);
      const result=await app.inject({method:'POST',url:'/auth/login',payload:{email,password}});
      assert.equal(result.statusCode,200,result.body);
      const cookie=result.headers['set-cookie']?.toString().split(';')[0];
      assert.ok(cookie);
      return {id:r.rows[0].id,cookie,email,password};
    }

    function auth(cookie:string){return {cookie,origin};}

    const reader=await createUser('USER');
    const reviewer=await createUser('APPROVER');
    const admin=await createUser('ADMIN');

    const spaces=await app.inject({method:'GET',url:'/spaces',headers:auth(reader.cookie)});
    assert.equal(spaces.statusCode,200);
    const entries=spaces.json().spaces as Array<{id:string;visibility:string;can_read:boolean;can_edit:boolean;can_approve:boolean}>;
    const shared=entries.find(x=>x.visibility==='SHARED')?.id;
    const adminSpaces=await app.inject({method:'GET',url:'/spaces',headers:auth(admin.cookie)});
    const restricted=adminSpaces.json().spaces.find((x:any)=>x.visibility==='RESTRICTED')?.id as string;
    assert.ok(shared&&restricted);

    // Test 1: Idempotency key prevents duplicate messages
    const idemKey=randomUUID();
    const convIdem=await app.inject({method:'POST',url:'/conversations',headers:auth(reader.cookie)});
    assert.equal(convIdem.statusCode,200);
    const convIdemId=convIdem.json().id as string;

    const first=await app.inject({
      method:'POST',url:'/conversations/'+convIdemId+'/messages',
      headers:{...auth(reader.cookie),'idempotency-key':idemKey},
      payload:{message:'Olá, como configurar o roteador?'}
    });
    assert.equal(first.statusCode,200,first.body);
    const firstBody=first.json();
    assert.ok(firstBody.id);
    assert.ok(!firstBody.idempotent);

    const retry=await app.inject({
      method:'POST',url:'/conversations/'+convIdemId+'/messages',
      headers:{...auth(reader.cookie),'idempotency-key':idemKey},
      payload:{message:'Olá, como configurar o roteador?'}
    });
    assert.equal(retry.statusCode,200,retry.body);
    const retryBody=retry.json();
    assert.equal(retryBody.id,firstBody.id,'Retry must return same message ID');
    assert.equal(retryBody.answer,firstBody.answer,'Retry must return same answer');
    assert.equal(retryBody.idempotent,true,'Retry response must be marked idempotent');

    const userMsgCount=await query(
      "SELECT count(*)::int AS total FROM messages WHERE conversation_id=$1 AND role='user' AND idempotency_key=$2",
      [convIdemId,idemKey]
    );
    assert.equal(userMsgCount.rows[0].total,1,'Idempotency key must prevent duplicate user messages');

    const noKey=await app.inject({
      method:'POST',url:'/conversations/'+convIdemId+'/messages',
      headers:auth(reader.cookie),
      payload:{message:'Olá, como configurar o roteador?'}
    });
    assert.equal(noKey.statusCode,200,noKey.body);
    const noKeyBody=noKey.json();
    assert.notEqual(noKeyBody.id,firstBody.id,'Request without key must create new message');

    const foreignRetry=await app.inject({method:'POST',url:'/conversations/'+convIdemId+'/messages',headers:{...auth(reviewer.cookie),'idempotency-key':idemKey},payload:{message:'Olá, como configurar o roteador?'}});
    assert.equal(foreignRetry.statusCode,404);
    const alteredRetry=await app.inject({method:'POST',url:'/conversations/'+convIdemId+'/messages',headers:{...auth(reader.cookie),'idempotency-key':idemKey},payload:{message:'Outra pergunta'}});
    assert.equal(alteredRetry.statusCode,409);
    const afterOtherTurn=await app.inject({method:'POST',url:'/conversations/'+convIdemId+'/messages',headers:{...auth(reader.cookie),'idempotency-key':idemKey},payload:{message:'Olá, como configurar o roteador?'}});
    assert.equal(afterOtherTurn.statusCode,200);
    assert.equal(afterOtherTurn.json().id,firstBody.id);
    assert.equal((await query('SELECT count(*)::int AS n FROM request_telemetry WHERE conversation_id=$1 AND idempotent_hit=true',[convIdemId])).rows[0].n,2);

    // Test 2: Concurrent requests - second gets 409 with Retry-After
    const convConcurrent=await app.inject({method:'POST',url:'/conversations',headers:auth(reader.cookie)});
    assert.equal(convConcurrent.statusCode,200);
    const convConcurrentId=convConcurrent.json().id as string;

    let releaseFirst:()=>void=()=>{};
    const firstLock=new Promise<void>(resolve=>{releaseFirst=resolve;});

    let markStarted:()=>void=()=>{};
    const started=new Promise<void>(resolve=>{markStarted=resolve;});
    const concurrentApp=await buildApp({agentResponder:async()=>{
      markStarted();
      await firstLock;
      return {answer:'First response',sources:[],pendingActions:[]};
    }});

    const req1=concurrentApp.inject({
      method:'POST',url:'/conversations/'+convConcurrentId+'/messages',
      headers:auth(reader.cookie),payload:{message:'Concurrent test 1'}
    });
    await Promise.race([started,req1.then(r=>{throw new Error('First turn ended before acquiring lock: '+r.statusCode);})]);

    const req2=concurrentApp.inject({
      method:'POST',url:'/conversations/'+convConcurrentId+'/messages',
      headers:auth(reader.cookie),payload:{message:'Concurrent test 2'}
    });

    const res2=await req2.finally(releaseFirst);
    const res1=await req1;

    const success=res1.statusCode===200?res1:res2;
    const busy=res1.statusCode===409?res1:res2;
    assert.equal(success.statusCode,200,'One request must succeed');
    assert.equal(busy.statusCode,409,'Concurrent request must get 409');
    assert.ok(busy.headers['retry-after'],'409 response must include Retry-After header');
    assert.ok(parseInt(busy.headers['retry-after'])>0,'Retry-After must be positive');

    await concurrentApp.close();

    // Test 3: Different conversations proceed independently
    const convOther=await app.inject({method:'POST',url:'/conversations',headers:auth(reader.cookie)});
    assert.equal(convOther.statusCode,200);
    const convOtherId=convOther.json().id as string;
    const other=await app.inject({
      method:'POST',url:'/conversations/'+convOtherId+'/messages',
      headers:auth(reader.cookie),payload:{message:'Other conversation'}
    });
    assert.equal(other.statusCode,200,'Different conversation must not be blocked');

    // Test 4: Invalid idempotency key format
    const badKey=await app.inject({
      method:'POST',url:'/conversations/'+convIdemId+'/messages',
      headers:{...auth(reader.cookie),'idempotency-key':'not-a-uuid'},
      payload:{message:'Test'}
    });
    assert.equal(badKey.statusCode,400,'Invalid UUID v4 must be rejected');

    // Test 5: Permission revoked during response returns 403/409
    const convRevoke=await app.inject({method:'POST',url:'/conversations',headers:auth(reader.cookie)});
    assert.equal(convRevoke.statusCode,200);
    const convRevokeId=convRevoke.json().id as string;

    let signalRevoke:()=>void=()=>{};
    const revokeStarted=new Promise<void>(resolve=>{signalRevoke=resolve;});
    let releaseRevoke:()=>void=()=>{};
    const revokeRelease=new Promise<void>(resolve=>{releaseRevoke=resolve;});

    const revokeApp=await buildApp({agentResponder:async()=>{
      signalRevoke();
      await revokeRelease;
      return {answer:'Should be discarded',sources:[],pendingActions:[]};
    }});

    const revokeReq=revokeApp.inject({
      method:'POST',url:'/conversations/'+convRevokeId+'/messages',
      headers:auth(reader.cookie),payload:{message:'Test revoke'}
    });
    await revokeStarted;

    const revokeGrant=await app.inject({method:'POST',url:'/admin/spaces/'+restricted+'/grants',
      headers:auth(admin.cookie),payload:{userId:reader.id,read:false,edit:false,approve:false}});
    assert.equal(revokeGrant.statusCode,200);

    releaseRevoke();
    const revokeRes=await revokeReq;
    assert.ok([403,409].includes(revokeRes.statusCode),'Revoked permission must fail the response');

    const persistedRevoke=await query("SELECT count(*)::int AS total FROM messages WHERE conversation_id=$1 AND role='assistant'",[convRevokeId]);
    assert.equal(persistedRevoke.rows[0].total,0,'No assistant message persisted after revoke');

    await revokeApp.close();

    const staleRetry=await app.inject({method:'POST',url:'/conversations/'+convIdemId+'/messages',headers:{...auth(reader.cookie),'idempotency-key':idemKey},payload:{message:'Olá, como configurar o roteador?'}});
    assert.equal(staleRetry.statusCode,409,'Old authorization revision must not replay');
    // Test 6: Client disconnect - lock is released, retry with idempotency key works
    const convDisconnect=await app.inject({method:'POST',url:'/conversations',headers:auth(reader.cookie)});
    assert.equal(convDisconnect.statusCode,200);
    const convDisconnectId=convDisconnect.json().id as string;

    const disconnectKey=randomUUID();
    let releaseDisconnect:()=>void=()=>{};
    const disconnectLock=new Promise<void>(resolve=>{releaseDisconnect=resolve;});

    const disconnectApp=await buildApp({agentResponder:async()=>{
      await disconnectLock;
      return {answer:'Disconnect test',sources:[],pendingActions:[]};
    }});

    const disconnectReq=disconnectApp.inject({
      method:'POST',url:'/conversations/'+convDisconnectId+'/messages',
      headers:{...auth(reader.cookie),'idempotency-key':disconnectKey},
      payload:{message:'Disconnect test'}
    });

    await new Promise(r=>setTimeout(r,100));
    releaseDisconnect();
    const disconnectRes=await disconnectReq;
    assert.equal(disconnectRes.statusCode,200);
    const disconnectBody=disconnectRes.json();
    assert.ok(disconnectBody.id);

    await disconnectApp.close();

    // Retry with same key after "disconnect" should return cached response
    const retryAfterDisconnect=await app.inject({
      method:'POST',url:'/conversations/'+convDisconnectId+'/messages',
      headers:{...auth(reader.cookie),'idempotency-key':disconnectKey},
      payload:{message:'Disconnect test'}
    });
    assert.equal(retryAfterDisconnect.statusCode,200);
    assert.equal(retryAfterDisconnect.json().id,disconnectBody.id);
    assert.equal(retryAfterDisconnect.json().idempotent,true);

    // Test 7: Pool saturation - multiple conversations concurrent on SAME app (advisory lock is per-conversation)
    const poolConvs=await Promise.all(
      Array.from({length:6},()=>app.inject({method:'POST',url:'/conversations',headers:auth(reader.cookie)}))
    );
    for(const r of poolConvs)assert.equal(r.statusCode,200);
    const poolConvIds=poolConvs.map(r=>r.json().id);

    const poolReqs=poolConvIds.map((convId,i)=>app.inject({
      method:'POST',url:'/conversations/'+convId+'/messages',
      headers:auth(reader.cookie),payload:{message:'Pool test '+i}
    }));
    const poolRes=await Promise.all(poolReqs);
    for(const r of poolRes)assert.equal(r.statusCode,200,'All concurrent conversations must succeed');

    await app.close();
    await pool.end();
  });
}