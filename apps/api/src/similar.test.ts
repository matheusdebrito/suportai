import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validDuplicateReason} from './similar.js';
test('a duplicate rationale must be substantial and bounded',()=>{
 assert.equal(validDuplicateReason('curto'),false);
 assert.equal(validDuplicateReason('Texto com explicação suficiente.'),true);
 assert.equal(validDuplicateReason('x'.repeat(501)),false);
});
