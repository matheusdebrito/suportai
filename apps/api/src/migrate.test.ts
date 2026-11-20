import {test} from 'node:test';
import assert from 'node:assert/strict';
import {query} from './db.js';

if(process.env.TEST_DATABASE_URL && process.env.DATABASE_URL===process.env.TEST_DATABASE_URL){
  test('migration history records exactly one applied initial schema',async()=>{
    const r=await query("SELECT filename,checksum FROM schema_migrations WHERE filename='001_init.sql'");
    assert.equal(r.rowCount,1);
    assert.match(r.rows[0].checksum,/^[a-f0-9]{64}$/);
    const schema=await query("SELECT to_regclass('public.users') AS users, to_regclass('public.documents') AS documents");
    assert.ok(schema.rows[0].users);
    assert.ok(schema.rows[0].documents);
  });
}
