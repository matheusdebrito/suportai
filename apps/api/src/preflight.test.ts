import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectProductionConfig} from './preflight.js';
const safe={NODE_ENV:'production',APP_ORIGIN:'https://suportai.example.test',
 DATABASE_URL:'postgresql://do-not-print-secret@db:5432/suportai',
 ALLOW_EXTERNAL_AI_DATA_PROCESSING:'false'};
test('production preflight reports only generic messages, never secrets',()=>{
 assert.deepEqual(inspectProductionConfig(safe),[]);
 const messages=inspectProductionConfig({...safe,APP_ORIGIN:'http://user:super-secret@localhost:5173',
   BOOTSTRAP_ADMIN_PASSWORD:'never-log-me'});
 assert.ok(messages.length>=2);
 assert.doesNotMatch(messages.join(' '),/super-secret|never-log-me|do-not-print-secret/);
});
test('production preflight rejects unsafe or inconsistent configuration',()=>{
 assert.ok(inspectProductionConfig({...safe,NODE_ENV:'development'}).length>0);
 assert.ok(inspectProductionConfig({...safe,APP_ORIGIN:undefined}).length>0);
 assert.ok(inspectProductionConfig({...safe,ALLOW_EXTERNAL_AI_DATA_PROCESSING:'true',
   OPENAI_API_KEY:undefined}).length>0);
 assert.ok(inspectProductionConfig({...safe,ALLOW_EXTERNAL_AI_DATA_PROCESSING:'maybe'}).length>0);
});
