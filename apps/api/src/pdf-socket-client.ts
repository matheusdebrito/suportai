import {request} from 'node:http';

const MAX_BYTES=8*1024*1024;
const MAX_OUTPUT_BYTES=2*1024*1024;
const DEFAULT_TIMEOUT=25_000;

/**
 * IPC boundary: the worker only sends PDF bytes to a separate, networkless
 * container. No API keys, DB URLs, or auth tokens are forwarded.
 * The remote response is bounded and never trusted as a raw exception.
 */
export function extractPdfViaSocket(bytes:Buffer,socketPath:string,timeoutMs=DEFAULT_TIMEOUT):Promise<string>{
 if(bytes.length>MAX_BYTES)throw new Error('PDF excede o limite de 8 MB');
 if(bytes.length<8||bytes.subarray(0,5).toString()!=='%PDF-')throw new Error('PDF inválido');
 if(!socketPath.startsWith('/')||socketPath.length>180)throw new Error('Socket do leitor de PDF inválido');
 return new Promise((resolve,reject)=>{
   let settled=false;
   let total=0;
   const chunks:Buffer[]=[];
   const finish=(err?:Error,text?:string)=>{
     if(settled)return;
     settled=true;
     clearTimeout(timer);
     if(err)reject(err);
     else resolve(text||'');
   };
   const req=request({socketPath,method:'POST',path:'/extract',headers:{
     'content-type':'application/pdf','content-length':bytes.length
   }},res=>{
     res.on('data',(chunk:Buffer)=>{
       total+=chunk.length;
       if(total>MAX_OUTPUT_BYTES){req.destroy();finish(new Error('PDF excede o limite de texto extraído'));}
       else chunks.push(chunk);
     });
     res.on('end',()=>{
       if(settled)return;
       const response=Buffer.concat(chunks).toString('utf8');
       if(res.statusCode!==200){
         // The parser service only emits known error labels. Do not persist
         // arbitrary network/socket error bodies in ingestion jobs.
         const allowed=new Set([
           'PDF inválido','PDF excede o limite de 8 MB',
           'PDF sem texto extraível; necessário texto digital',
           'PDF excede o limite de 200 páginas','PDF excede os limites de processamento',
           'Tempo limite para leitura do PDF excedido',
           'PDF excede o limite de texto extraído',
           'PDF inválido ou não foi possível extrair o texto'
         ]);
         finish(new Error(allowed.has(response)?response:'Leitor de PDF isolado recusou o documento'));
       }else if(!response.trim()){
         finish(new Error('PDF sem texto extraível; necessário texto digital'));
       }else finish(undefined,response);
     });
     res.on('error',()=>finish(new Error('Leitor de PDF isolado indisponível')));
   });
   const timer=setTimeout(()=>{
     req.destroy();
     finish(new Error('Tempo limite para leitura do PDF excedido'));
   },Math.max(1000,Math.min(timeoutMs+3000,63000)));
   req.on('error',()=>finish(new Error('Leitor de PDF isolado indisponível')));
   req.end(bytes);
 });
}
