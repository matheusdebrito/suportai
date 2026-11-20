import './env.js';
import {extractPdfText} from './pdf-extract.js';
import {pool,query} from './db.js';
import {chunks,hasSecrets} from './knowledge.js';
import {embedText} from './llm.js';
import {safeWorkerFailure} from './safe-errors.js';
import {claimJob,renewLease,storeClaimedResult,failClaimedJob,expireStaleJobs} from './worker-jobs.js';

async function processNext():Promise<boolean>{
 await expireStaleJobs();
 const job=await claimJob();
 if(!job)return false;
 try{
   const r=await query('SELECT content,pdf_bytes FROM document_versions WHERE id=$1',[job.versionId]);
   if(!r.rowCount)throw new Error('Versão inexistente');
   let text=r.rows[0].content as string;
   if(r.rows[0].pdf_bytes){
     const bytes=r.rows[0].pdf_bytes as Buffer;
     // PDF bytes are untrusted. Parse in a subprocess with no inherited secrets.
     text=await extractPdfText(bytes);
   }
   if(hasSecrets(text))throw new Error('Possível credencial detectada; revisão necessária');
   if(!text.trim())throw new Error('Documento vazio');
   if(text.length>450000)throw new Error('Documento muito extenso; divida-o em arquivos menores');
   const parts=chunks(text);
   if(parts.length>500)throw new Error('Quantidade de trechos excede o limite; processamento interrompido');
   const vectors:(number[]|null)[]=[];
   for(const part of parts){
     // Keep lease alive across potentially slow embedding calls.
     if(!await renewLease(job))return true;
     try{vectors.push(await embedText(part));}
     catch{vectors.push(null);}
   }
   await storeClaimedResult(job,text,parts,vectors);
 }catch(e){
   await failClaimedJob(job,safeWorkerFailure(e));
 }
 return true;
}
if(process.env.NODE_ENV==='test')throw new Error('Worker not executed in tests');
let running=true;
process.on('SIGTERM',()=>{running=false;});
process.on('SIGINT',()=>{running=false;});
while(running){
 const found=await processNext().catch(e=>{
   console.error('Worker job failure',safeWorkerFailure(e));
   return false;
 });
 if(!found)await new Promise(r=>setTimeout(r,1500));
}
await pool.end();
