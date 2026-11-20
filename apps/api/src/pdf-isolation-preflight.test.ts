import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectPdfWorkerIsolation} from './pdf-isolation-preflight.js';

const protectedStatus=['Name: node','NoNewPrivs: 1','CapEff: 0000000000000000','Seccomp: 2'].join(String.fromCharCode(10));
test('worker OS hardening preflight accepts a minimal non-root Linux snapshot',()=>{
 assert.deepEqual(inspectPdfWorkerIsolation({platform:'linux',uid:1000,procStatus:protectedStatus}),[]);
});
test('worker OS hardening preflight rejects root, capabilities, disabled seccomp and privileges',()=>{
 const issues=inspectPdfWorkerIsolation({platform:'linux',uid:0,
   procStatus:['NoNewPrivs: 0','CapEff: 0000000000002000','Seccomp: 0'].join(String.fromCharCode(10))});
 assert.equal(issues.length,4);
 assert.ok(issues.some(x=>x.includes('não-root')));
 assert.ok(issues.some(x=>x.includes('NoNewPrivs')));
 assert.ok(issues.some(x=>x.includes('Seccomp')));
});
test('missing proc status and unsupported platforms fail closed',()=>{
 assert.ok(inspectPdfWorkerIsolation({platform:'linux',uid:1001,procStatus:undefined}).length>=3);
 assert.ok(inspectPdfWorkerIsolation({platform:'win32',uid:undefined,procStatus:undefined}).length>0);
});
