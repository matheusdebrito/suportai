import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// Use the repository-root .env in both tsx/src and node/dist executions.
const path=fileURLToPath(new URL('../../../.env',import.meta.url));
if(existsSync(path)) process.loadEnvFile(path);
