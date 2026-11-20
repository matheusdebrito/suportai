import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hasSecrets,chunks} from './knowledge.js';
test('detects private keys and credential-like assignments',()=>{
 assert.equal(hasSecrets('-----BEGIN PRIVATE KEY-----'),true);
 assert.equal(hasSecrets('api_key = abcdefghijklmnop'),true);
 assert.equal(hasSecrets('Authorization: Bearer abcdefghijklmnopqrstuvwxyz'),true);
 assert.equal(hasSecrets('github_pat_abcdefghijklmnopqrstuvwxyz123456'),true);
 assert.equal(hasSecrets('Configure o driver da impressora'),false);
});
test('chunks do not drop final bytes',()=>{
 const text='a'.repeat(2600);
 const parts=chunks(text);
 assert.ok(parts.length>2);
 assert.equal(parts.at(-1)?.endsWith('a'),true);
});
