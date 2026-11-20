import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectPdfWorkerIsolation} from './pdf-isolation-preflight.js';

const protectedStatus='Name:\\tnode\\nNoNewPrivs:\\t1\\nCapEff:\\t0000000000000000\\nSeccomp:\\t2\\n';
test('worker OS hardening preflight accepts a minimal non-root Linux snapshot',()=>{
 assert.deepEqual(inspectPdfWorkerIsolation({platform:'linux',uid:1000,procStatus:protectedStatus}),[]);
});
test('worker OS hardening preflight rejects root, capabilities, disabled seccomp and privileges',()=>{
 const issues=inspectPdfWorkerIsolation({platform:'linux',uid:0,
   procStatus:'NoNewPrivs:\\t0\\nCapEff:\\t0000000000002000\\nSeccomp:\\t0\\n'});
 assert.equal(issues.length,4);
 assert.ok(issues.some(x=>x.includes('não-root')));
 assert.ok(issues.some(x=>x.includes('NoNewPrivs')));
 assert.ok(issues.some(x=>x.includes('Seccomp')));
});
test('missing proc status and unsupported platforms fail closed',()=>{
 assert.ok(inspectPdfWorkerIsolation({platform:'linux',uid:1001,procStatus:undefined}).length>=3);
 assert.ok(inspectPdfWorkerIsolation({platform:'win32',uid:undefined,procStatus:undefined}).length>0);
});
