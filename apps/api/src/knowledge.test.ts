import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hasSecrets,chunks} from './knowledge.js';
test('detects private keys and credential-like assignments',()=>{
 assert.equal(hasSecrets('-----BEGIN PRIVATE KEY-----'),true);
 assert.equal(hasSecrets('api_key = abcdefghijklmnop'),true);
 assert.equal(hasSecrets('senha: Senha#Forte@2026!'),true);
 assert.equal(hasSecrets('password="Senha forte! #2026"'),true);
 assert.equal(hasSecrets('token: abcdef!@#0123456789'),true);
 assert.equal(hasSecrets('Senha deve ter pelo menos 12 caracteres.'),false);
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
