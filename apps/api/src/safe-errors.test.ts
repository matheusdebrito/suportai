import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeErrorType,safeWorkerFailure} from './safe-errors.js';

test('known parser errors remain actionable without leaking arbitrary messages',()=>{
 assert.equal(safeWorkerFailure(new Error('PDF sem texto extraível; necessário texto digital')),
   'PDF sem texto extraível; necessário texto digital');
 assert.equal(safeWorkerFailure(new Error('PDF excede o limite de 200 páginas')),
   'PDF excede o limite de 200 páginas');
});
test('database and provider failures cannot reveal secrets in worker job status',()=>{
 const sensitive='password=SuperSecret2026! SELECT * FROM private_documents';
 assert.equal(safeWorkerFailure(new Error(sensitive)),
   'Falha interna de processamento; contate a equipe de TI');
 assert.equal(safeWorkerFailure({message:sensitive}),
   'Falha interna de processamento; contate a equipe de TI');
});
test('API diagnostic category does not contain arbitrary exception text',()=>{
 const injected=new Error('secret=SuperSecret2026! user-entered payload');
 assert.equal(safeErrorType(injected),'Error');
 assert.equal(safeErrorType(new SyntaxError(injected.message)),'SyntaxError');
 assert.doesNotMatch(safeErrorType(injected),/SuperSecret/);
});
