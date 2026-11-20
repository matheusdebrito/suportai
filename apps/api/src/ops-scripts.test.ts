import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

for(const file of ['backup.sh','verify-restore.sh','monitor.sh']){
 test('operational script '+file+' passes shell parsing without production access',()=>{
   const path=fileURLToPath(new URL('../../../deploy/'+file,import.meta.url));
   const result=spawnSync('bash',['-n',path],{encoding:'utf8',timeout:5000});
   assert.equal(result.status,0,result.stderr);
   const source=readFileSync(path,'utf8');
   assert.match(source,/set -euo pipefail/);
   assert.doesNotMatch(source,/DROP DATABASE|TRUNCATE TABLE|--clean/);
   if(file==='verify-restore.sh')assert.doesNotMatch(source,/compose\.production\.yml|SUPORTAI_ENV_FILE|dropdb/);
 });
}
