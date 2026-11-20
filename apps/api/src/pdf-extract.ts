import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const MAX_BYTES=8*1024*1024;
const MAX_OUTPUT_BYTES=2*1024*1024;
const DEFAULT_TIMEOUT=25_000;
const parserPath=fileURLToPath(new URL('../bin/extract-pdf-child.mjs',import.meta.url));

/**
 * Limits parser exposure to a subprocess with a restricted environment and
 * a V8 heap budget. This is fault containment, NOT an OS-level sandbox.
 */
export function extractPdfText(bytes:Buffer,timeoutMs=DEFAULT_TIMEOUT):Promise<string>{
 if(bytes.length>MAX_BYTES)throw new Error('PDF excede o limite de 8 MB');
 if(bytes.length<8||bytes.subarray(0,5).toString()!=='%PDF-')
   throw new Error('PDF inválido');
 return new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,['--max-old-space-size=192',parserPath],{
     stdio:['pipe','pipe','pipe'],
     env:{NODE_ENV:'production'},
     windowsHide:true
   });
   const parts:Buffer[]=[];
   let length=0;
   let timedOut=false;
   let tooLarge=false;
   let settled=false;
   const finish=(error?:Error,text?:string)=>{
     if(settled)return;
     settled=true;
     clearTimeout(timeout);
     if(error)reject(error);
     else resolve(text||'');
   };
   const timeout=setTimeout(()=>{
     timedOut=true;
     child.kill('SIGKILL');
   },Math.max(1000,Math.min(timeoutMs,60_000)));
   child.stdout.on('data',(part:Buffer)=>{
     if(tooLarge)return;
     length+=part.length;
     if(length>MAX_OUTPUT_BYTES){
       tooLarge=true;
       child.kill('SIGKILL');
       return;
     }
     parts.push(part);
   });
   // Ignore raw parser errors and warnings, which could contain file bytes.
   child.stderr.resume();
   child.stdin.on('error',()=>{ /* child may reject the payload before stdin finishes */ });
   child.on('error',()=>finish(new Error('Não foi possível iniciar o leitor de PDFs')));
   child.on('close',(code)=>{
     if(timedOut)return finish(new Error('Tempo limite para leitura do PDF excedido'));
     if(tooLarge)return finish(new Error('PDF excede o limite de texto extraído'));
     if(code===42)return finish(new Error('PDF sem texto extraível; necessário texto digital'));
     if(code===43)return finish(new Error('PDF excede o limite de 200 páginas'));
     if(code===44)return finish(new Error('PDF excede os limites de processamento'));
     if(code!==0)return finish(new Error('PDF inválido ou não foi possível extrair o texto'));
     finish(undefined,Buffer.concat(parts).toString('utf8'));
   });
   child.stdin.end(bytes);
 });
}
