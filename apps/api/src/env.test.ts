import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hydrateFileSecrets} from './env.js';

test('file-backed database and AI credentials load without logging their values',()=>{
 const testEnv:NodeJS.ProcessEnv={
   DATABASE_URL_FILE:'/run/secrets/database_url',OPENAI_API_KEY_FILE:'/run/secrets/ai_key'
 };
 hydrateFileSecrets(testEnv,path=>path.endsWith('ai_key')?'synthetic-key':'postgres://fake:pass@db/suportai');
 assert.equal(testEnv.DATABASE_URL,'postgres://fake:pass@db/suportai');
 assert.equal(testEnv.OPENAI_API_KEY,'synthetic-key');
});
test('ambiguous credentials and relative secret paths are rejected',()=>{
 assert.throws(()=>hydrateFileSecrets({
   DATABASE_URL:'postgres://fake',DATABASE_URL_FILE:'/run/secrets/database_url'
 },()=>''),/Configuração de segredo ambígua/);
 assert.throws(()=>hydrateFileSecrets({OPENAI_API_KEY_FILE:'relative/key'},()=>''),/caminho inválido/);
});
test('file content must have a strict upper bound',()=>{
 assert.throws(()=>hydrateFileSecrets({DATABASE_URL_FILE:'/run/secret'},()=>('x'.repeat(8193))),/limite/);
});
