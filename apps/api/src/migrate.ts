import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { pool } from './db.js';

const directory=fileURLToPath(new URL('../sql/',import.meta.url));
const client=await pool.connect();
let locked=false;

try {
  // A database-level lock serializes concurrent deployments. A failed step
  // releases the lock without leaving a partially applied migration behind.
  await client.query("SET lock_timeout TO '10s'");
  await client.query('SELECT pg_advisory_lock(73016,1)');
  locked=true;
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
  const files=(await readdir(directory)).filter(x=>/^[0-9]{3}_[a-z0-9_-]+\.sql$/i.test(x)).sort();
  if(!files.length) throw new Error('Nenhuma migração SQL encontrada');
  for(const filename of files){
    const sql=await readFile(join(directory,filename),'utf8');
    const checksum=createHash('sha256').update(sql).digest('hex');
    await client.query('BEGIN');
    try {
      const previous=await client.query('SELECT checksum FROM schema_migrations WHERE filename=$1',[filename]);
      if(previous.rowCount){
        if(previous.rows[0].checksum!==checksum) throw new Error('Migração já aplicada foi modificada: '+filename);
        await client.query('COMMIT');
        console.log('Migration unchanged: '+filename);
        continue;
      }
      // Existing installations of the pre-versioned schema cannot be
      // automatically adopted without inspecting whether they are complete.
      if(filename===files[0]){
        const legacy=await client.query("SELECT to_regclass('public.users') AS users, to_regclass('public.documents') AS documents");
        if(legacy.rows[0].users || legacy.rows[0].documents){
          throw new Error('Esquema legado encontrado sem histórico de migração. Requer verificação e regularização manual, sem apagar dados.');
        }
      }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)',[filename,checksum]);
      await client.query('COMMIT');
      console.log('Migration applied: '+filename);
    }catch(error){
      await client.query('ROLLBACK');
      throw error;
    }
  }
  // Detect schema drift instead of claiming success because a checksum row exists.
  for(const table of ['users','sessions','spaces','document_versions','knowledge_chunks']){
    const found=await client.query('SELECT to_regclass($1::text) AS object_name',['public.'+table]);
    if(!found.rows[0].object_name) throw new Error('Objeto de banco ausente após migração: '+table);
  }
}finally{
  if(locked) await client.query('SELECT pg_advisory_unlock(73016,1)').catch(()=>{});
  client.release();
  await pool.end();
}
