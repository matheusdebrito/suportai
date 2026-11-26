import {existsSync,readFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

// Use the repository-root .env in both tsx/src and node/dist executions.
const path=fileURLToPath(new URL('../../../.env',import.meta.url));
if(existsSync(path))process.loadEnvFile(path);

/** Compose secrets: only the file path is visible in container environment. */
export function hydrateFileSecrets(env:NodeJS.ProcessEnv,read:(path:string)=>string=path=>readFileSync(path,'utf8')){
 for(const key of ['DATABASE_URL','OPENAI_API_KEY','BOOTSTRAP_ADMIN_PASSWORD'] as const){
   const file=env[key+'_FILE'];
   if(!file)continue;
   if(!isAbsolute(file)||env[key]!==undefined)
     throw new Error('Configuração de segredo ambígua ou caminho inválido: '+key);
   const contents=read(file).trim();
   if(contents.length>8192)throw new Error('Arquivo de segredo excedeu o limite: '+key);
   env[key]=contents;
 }
}
hydrateFileSecrets(process.env);
