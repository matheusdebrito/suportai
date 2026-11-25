import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,query} from './db.js';

if(process.env.TEST_DATABASE_URL && process.env.DATABASE_URL===process.env.TEST_DATABASE_URL){
  test('migration history records exactly one applied initial schema',async()=>{
    const r=await query("SELECT filename,checksum FROM schema_migrations WHERE filename='001_init.sql'");
    assert.equal(r.rowCount,1);
    assert.match(r.rows[0].checksum,/^[a-f0-9]{64}$/);
    const schema=await query("SELECT to_regclass('public.users') AS users, to_regclass('public.documents') AS documents");
    assert.ok(schema.rows[0].users);
    assert.ok(schema.rows[0].documents);
  });

  test('investigation storage enforces ownership, bounds and cleanup on conversation deletion',async()=>{
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const owner=randomUUID();
      const otherUser=randomUUID();
      await client.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'fixture'),($3,$4,'fixture')",
        [owner,`${owner}@example.test`,otherUser,`${otherUser}@example.test`]);
      const conversation=randomUUID();
      await client.query('INSERT INTO conversations(id,user_id) VALUES($1,$2)',[conversation,owner]);

      const insertInvestigation=`INSERT INTO investigations(conversation_id,user_id,auth_revision,topic)
        VALUES($1,$2,0,$3) RETURNING id,revision,last_activity_at`;
      await client.query('SAVEPOINT invalid_owner');
      await assert.rejects(client.query(insertInvestigation,[conversation,otherUser,'Impressora']),{code:'23503'});
      await client.query('ROLLBACK TO SAVEPOINT invalid_owner');

      const first=await client.query(insertInvestigation,[conversation,owner,'Impressora']);
      const second=await client.query(insertInvestigation,[conversation,owner,'Conexão']);
      assert.notEqual(first.rows[0].id,second.rows[0].id);
      assert.equal(first.rows[0].revision,1);
      assert.ok(first.rows[0].last_activity_at instanceof Date);

      const insertNote=`INSERT INTO investigation_notes(investigation_id,kind,position,content,test_result)
        VALUES($1,$2,$3,$4,$5)`;
      const investigation=first.rows[0].id;
      await client.query(insertNote,[investigation,'REPORTED_FACT',1,'A fila parou.',null]);
      await client.query(insertNote,[investigation,'TEST',1,'Enviar página de teste.','Página recebida.']);
      await client.query('SAVEPOINT invalid_note');
      await assert.rejects(client.query(insertNote,[investigation,'HYPOTHESIS',13,'Fila pausada.',null]),{code:'23514'});
      await client.query('ROLLBACK TO SAVEPOINT invalid_note');
      await assert.rejects(client.query(insertNote,[investigation,'REPORTED_FACT',2,'Fila pausada.','Resultado']),{code:'23514'});
      await client.query('ROLLBACK TO SAVEPOINT invalid_note');

      const document=randomUUID();
      const version=randomUUID();
      await client.query(`INSERT INTO documents(id,space_id,title,kind)
        SELECT $1,id,'Procedimento fictício','ARTICLE' FROM spaces WHERE visibility='SHARED' LIMIT 1`,[document]);
      await client.query(`INSERT INTO document_versions(id,document_id,version_number,status,authored_by)
        VALUES($1,$2,1,'PUBLISHED',$3)`,[version,document,owner]);
      await client.query('INSERT INTO investigation_sources(investigation_id,version_id,position) VALUES($1,$2,1)',
        [investigation,version]);

      await client.query('DELETE FROM conversations WHERE id=$1',[conversation]);
      assert.equal((await client.query('SELECT id FROM investigations WHERE conversation_id=$1',[conversation])).rowCount,0);
      assert.equal((await client.query('SELECT 1 FROM investigation_notes WHERE investigation_id=$1',[investigation])).rowCount,0);
      assert.equal((await client.query('SELECT 1 FROM investigation_sources WHERE investigation_id=$1',[investigation])).rowCount,0);
    }finally{
      await client.query('ROLLBACK');
      client.release();
    }
  });
}
