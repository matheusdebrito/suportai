import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canApprove, canRead, canEdit, hashToken } from './security.js';
test('shared content is readable but restricted content requires grant',()=>{
 assert.equal(canRead('SHARED'),true);
 assert.equal(canRead('RESTRICTED'),false);
 assert.equal(canRead('RESTRICTED',{can_read:true}),true);
 assert.equal(canEdit('RESTRICTED',{can_edit:false}),false);
 assert.equal(canEdit('SHARED'),false);
 assert.equal(canEdit('SHARED',{can_edit:true}),true);
 assert.equal(canEdit('RESTRICTED',{can_edit:true,can_read:false}),false);
 assert.equal(canEdit('RESTRICTED',{can_edit:true,can_read:true}),true);
});
test('approval requires reviewer role and space approval grant',()=>{
 assert.equal(canApprove('ADMIN','SHARED'),false);
 assert.equal(canApprove('USER','SHARED'),false);
 assert.equal(canApprove('APPROVER','SHARED'),false);
 assert.equal(canApprove('APPROVER','SHARED',{can_approve:true}),true);
 assert.equal(canApprove('APPROVER','RESTRICTED',{can_approve:false}),false);
 assert.equal(canApprove('APPROVER','RESTRICTED',{can_approve:true}),false);
 assert.equal(canApprove('APPROVER','RESTRICTED',{can_read:true,can_approve:true}),true);
});
test('tokens are hashed consistently',()=>assert.equal(hashToken('a'),hashToken('a')));
