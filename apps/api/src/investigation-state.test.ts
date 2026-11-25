import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,query,transaction} from './db.js';
import {purgeExpiredInvestigations,readInvestigationState,saveInvestigationState,type InvestigationDraft} from './investigation-state.js';
import type {Actor} from './security.js';

if(!process.env.TEST_DATABASE_URL){
  test('investigation storage requires an isolated PostgreSQL test database',{skip:'No TEST_DATABASE_URL'},()=>{});
}else{
  if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw new Error('Investigation tests require DATABASE_URL to equal TEST_DATABASE_URL');
  after(()=>pool.end());

  test('investigation snapshots round trip, isolate subjects and reject a concurrent stale write',async()=>{
    const fixture=await createFixture();
    const {actor,otherActor,conversation,otherConversation}=fixture;
    try{
      const draft:InvestigationDraft={topic:'Impressora',equipmentOrSystem:'Impressora do laboratório',environment:'Teste',
        reportedFacts:['A fila parou.','O painel acendeu.'],hypotheses:['Fila pausada.'],openQuestions:['A segunda fila funciona?'],
        tests:[{content:'Imprimir página.',result:'A página saiu.'},{content:'Verificar a segunda fila.',result:null}],sourceVersionIds:[]};
      assert.deepEqual(await saveInvestigationState(otherActor,conversation,draft),{status:'not_found'});
      const created=await saveInvestigationState(actor,conversation,draft);
      assert.equal(created.status,'saved');
      const {id,revision,lastActivityAt}=created.state;
      assert.equal(revision,1);
      assert.deepEqual(await readInvestigationState(actor,conversation,id),created.state);
      assert.equal(await readInvestigationState(otherActor,conversation,id),null);
      assert.equal(await readInvestigationState(actor,otherConversation,id),null);
      assert.deepEqual(await saveInvestigationState(actor,otherConversation,draft,{id,expectedRevision:1}),{status:'not_found'});

      const second=await saveInvestigationState(actor,conversation,{...draft,topic:'Conexão'});
      assert.equal(second.status,'saved');
      await query("UPDATE investigations SET last_activity_at=now()-interval '719 hours' WHERE id=$1",[second.state.id]);
      const before=await readInvestigationState(actor,conversation,second.state.id);
      assert.ok(before);
      const updates=await Promise.all([
        saveInvestigationState(actor,conversation,{...draft,reportedFacts:['Atualização A'],openQuestions:[]},{id,expectedRevision:1}),
        saveInvestigationState(actor,conversation,{...draft,reportedFacts:['Atualização B'],openQuestions:[]},{id,expectedRevision:1})
      ]);
      assert.equal(updates.filter(result=>result.status==='conflict').length,1);
      const winner=updates.find(result=>result.status==='saved');
      assert.ok(winner);
      assert.equal(winner.state.revision,2);
      assert.ok(winner.state.lastActivityAt>=lastActivityAt);
      assert.deepEqual(await readInvestigationState(actor,conversation,id),winner.state);
      assert.deepEqual(await readInvestigationState(actor,conversation,second.state.id),before);

      await assert.rejects(saveInvestigationState(actor,conversation,{...draft,reportedFacts:['token: synthetic-credential-for-test']},
        {id,expectedRevision:2}),{statusCode:422});
      assert.deepEqual(await readInvestigationState(actor,conversation,id),winner.state);
      await query("UPDATE investigations SET last_activity_at=now()-interval '720 hours' WHERE id=$1",[second.state.id]);
      assert.equal(await readInvestigationState(actor,conversation,second.state.id),null);
      assert.deepEqual(await saveInvestigationState(actor,conversation,draft,{id:second.state.id,expectedRevision:1}),{status:'not_found'});
      assert.deepEqual(await readInvestigationState(actor,conversation,id),winner.state);
    }finally{
      await fixture.cleanup();
    }
  });

  test('source access, deletion and account revision invalidate stored investigation context',async()=>{
    const fixture=await createFixture();
    const {actor,conversation}=fixture;
    const document=randomUUID();
    const version=randomUUID();
    const draft:InvestigationDraft={topic:'Conexão',reportedFacts:[],hypotheses:[],openQuestions:[],tests:[],sourceVersionIds:[version]};
    try{
      const space=await transaction(async client=>{
        const inserted=await client.query(`INSERT INTO documents(id,space_id,title,kind)
          SELECT $1,id,'Procedimento fictício','ARTICLE' FROM spaces WHERE visibility='RESTRICTED' LIMIT 1
          RETURNING space_id`,[document]);
        await client.query(`INSERT INTO document_versions(id,document_id,version_number,status,index_status,authored_by)
          VALUES($1,$2,1,'PUBLISHED','READY',$3)`,[version,document,actor.id]);
        await client.query('UPDATE documents SET current_version_id=$2 WHERE id=$1',[document,version]);
        return inserted.rows[0].space_id as string;
      });
      assert.deepEqual(await saveInvestigationState(actor,conversation,draft),{status:'source_unavailable'});
      await query('INSERT INTO space_grants(space_id,user_id,can_read) VALUES($1,$2,true)',[space,actor.id]);
      const created=await saveInvestigationState(actor,conversation,draft);
      assert.equal(created.status,'saved');
      const {id}=created.state;
      assert.deepEqual(await readInvestigationState(actor,conversation,id),created.state);
      await query('UPDATE space_grants SET can_read=false WHERE space_id=$1 AND user_id=$2',[space,actor.id]);
      assert.equal(await readInvestigationState(actor,conversation,id),null);
      assert.deepEqual(await saveInvestigationState(actor,conversation,{...draft,sourceVersionIds:[]},{id,expectedRevision:1}),
        {status:'source_unavailable'});
      await query('UPDATE space_grants SET can_read=true WHERE space_id=$1 AND user_id=$2',[space,actor.id]);
      assert.deepEqual(await readInvestigationState(actor,conversation,id),created.state);
      await query('UPDATE documents SET archived_at=now() WHERE id=$1',[document]);
      assert.equal(await readInvestigationState(actor,conversation,id),null);
      await query('DELETE FROM documents WHERE id=$1',[document]);
      assert.equal(await readInvestigationState(actor,conversation,id),null);
      assert.deepEqual(await saveInvestigationState(actor,conversation,{...draft,sourceVersionIds:[]},{id,expectedRevision:1}),
        {status:'source_unavailable'});

      const noSource=await saveInvestigationState(actor,conversation,{...draft,sourceVersionIds:[]});
      assert.equal(noSource.status,'saved');
      await query('UPDATE users SET auth_revision=1 WHERE id=$1',[actor.id]);
      assert.equal(await readInvestigationState(actor,conversation,noSource.state.id),null);
      assert.equal(await readInvestigationState({...actor,auth_revision:1},conversation,noSource.state.id),null);
      await assert.rejects(saveInvestigationState(actor,conversation,{...draft,sourceVersionIds:[]}),{statusCode:403});
    }finally{
      await query('DELETE FROM documents WHERE id=$1',[document]);
      await fixture.cleanup();
    }
  });

  test('cleanup removes only states older than 30 days and preserves the chat transcript and feedback',async()=>{
    const {actor,conversation,cleanup}=await createFixture();
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const states=await client.query<{id:string;topic:string}>(`INSERT INTO investigations(conversation_id,user_id,auth_revision,topic,last_activity_at)
        SELECT $1,$2,0,topic,now()-age FROM (VALUES
          ('Expirado',interval '720 hours 1 second'),('No limite',interval '720 hours'),('Ativo',interval '719 hours 59 minutes 59 seconds')
        ) AS fixtures(topic,age) RETURNING id,topic`,[conversation,actor.id]);
      const expired=states.rows.find(state=>state.topic==='Expirado')!;
      const document=randomUUID();
      const version=randomUUID();
      await client.query(`INSERT INTO documents(id,space_id,title,kind)
        SELECT $1,id,'Artigo de teste','ARTICLE' FROM spaces WHERE visibility='SHARED' LIMIT 1`,[document]);
      await client.query(`INSERT INTO document_versions(id,document_id,version_number,status,index_status,authored_by)
        VALUES($1,$2,1,'PUBLISHED','READY',$3)`,[version,document,actor.id]);
      const investigationIds=states.rows.map(state=>state.id);
      await client.query(`INSERT INTO investigation_notes(investigation_id,kind,position,content)
        SELECT id,'REPORTED_FACT',1,'Relato original' FROM unnest($1::uuid[]) AS selected(id)`,[investigationIds]);
      await client.query(`INSERT INTO investigation_sources(investigation_id,version_id,position)
        SELECT id,$2,1 FROM unnest($1::uuid[]) AS selected(id)`,[investigationIds,version]);

      const userMessage=randomUUID();
      const assistantMessage=randomUUID();
      await client.query(`INSERT INTO messages(id,conversation_id,role,content,auth_revision,investigation_id,context_source_version_ids)
        VALUES($1,$3,'user','Relato original',0,$4,'{}'),($2,$3,'assistant','Resposta original',0,$4,$5::uuid[])`,
        [userMessage,assistantMessage,conversation,expired.id,[version]]);
      await client.query("INSERT INTO feedback(user_id,message_id,rating,comment) VALUES($1,$2,'GOOD','Ficou registrado')",
        [actor.id,assistantMessage]);
      const historySql='SELECT * FROM messages WHERE conversation_id=$1 ORDER BY id';
      const originalHistory=(await client.query(historySql,[conversation])).rows;

      assert.equal(await purgeExpiredInvestigations(client),1);
      assert.equal(await purgeExpiredInvestigations(client),0);
      const expectedIds=investigationIds.filter(id=>id!==expired.id).sort();
      const remaining=await client.query('SELECT id FROM investigations WHERE conversation_id=$1 ORDER BY id',[conversation]);
      assert.deepEqual(remaining.rows.map(row=>row.id),expectedIds);
      for(const table of ['investigation_notes','investigation_sources']){
        const children=await client.query(`SELECT investigation_id FROM ${table}
          WHERE investigation_id=ANY($1::uuid[]) ORDER BY investigation_id`,[investigationIds]);
        assert.deepEqual(children.rows.map(row=>row.investigation_id),expectedIds);
      }
      assert.deepEqual((await client.query(historySql,[conversation])).rows,originalHistory);
      assert.equal((await client.query('SELECT comment FROM feedback WHERE message_id=$1',[assistantMessage])).rows[0].comment,
        'Ficou registrado');
    }finally{
      await client.query('ROLLBACK');
      client.release();
      await cleanup();
    }
  });
}

async function createFixture(){
  const actor:Actor={id:randomUUID(),role:'USER',auth_revision:0,must_change_password:false};
  const otherActor:Actor={...actor,id:randomUUID()};
  const conversation=randomUUID();
  const otherConversation=randomUUID();
  await transaction(async client=>{
    await client.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'fixture'),($3,$4,'fixture')",
      [actor.id,`${actor.id}@example.test`,otherActor.id,`${otherActor.id}@example.test`]);
    await client.query('INSERT INTO conversations(id,user_id) VALUES($1,$3),($2,$3)',[conversation,otherConversation,actor.id]);
  });
  return {actor,otherActor,conversation,otherConversation,
    cleanup:()=>query('DELETE FROM users WHERE id=ANY($1::uuid[])',[[actor.id,otherActor.id]])};
}
