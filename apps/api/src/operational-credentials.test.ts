import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {sealCredential,openCredential} from './operational-credentials.js';
test('credential encryption is authenticated and bound to its document and identity',()=>{
 const key=randomBytes(32),id=randomUUID(),document_id=randomUUID(),value='fixture-'+randomUUID();
 const encrypted=sealCredential(value,id,document_id,key);
 assert.notDeepEqual(encrypted.iv,sealCredential(value,id,document_id,key).iv);
 const row={...encrypted,id,document_id};
 assert.equal(openCredential(row,key),value);
 assert.throws(()=>openCredential({...row,document_id:randomUUID()},key));
 assert.throws(()=>openCredential({...row,id:randomUUID()},key));
 assert.throws(()=>openCredential(row,randomBytes(32)));
 const tampered=Buffer.from(row.ciphertext);tampered[0]^=1;
 assert.throws(()=>openCredential({...row,ciphertext:tampered},key));
});
