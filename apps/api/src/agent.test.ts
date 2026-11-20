import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canApprove,canRead} from './security.js';
test('model cannot gain read permission from its prompt',()=>{
 const maliciousModelInput={can_read:true,role:'ADMIN'};
 assert.equal(canRead('RESTRICTED',null),false);
 assert.equal(canApprove(maliciousModelInput.role,'RESTRICTED',null),false);
});
