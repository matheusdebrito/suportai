import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {chmodSync,existsSync,lstatSync,unlinkSync} from 'node:fs';
import {extractPdfTextLocally} from './pdf-extract.js';
import {safeWorkerFailure} from './safe-errors.js';

const MAX_BYTES=8*1024*1024;
function reply(res:ServerResponse,status:number,message:string){
 res.writeHead(status,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});
 res.end(message);
}
/** A dedicated process: no API, DB, embeddings or credentials are required. */
export function createPdfParserServer(){
 const server=createServer(async(req:IncomingMessage,res:ServerResponse)=>{
   if(req.method!=='POST'||req.url!=='/extract'){
     reply(res,404,'Not found');return;
   }
   if(req.headers['content-type']!=='application/pdf'){
     reply(res,415,'PDF inválido');return;
   }
   const parts:Buffer[]=[];
   let size=0;
   try{
     for await(const part of req){
       size+=(part as Buffer).length;
       if(size>MAX_BYTES){reply(res,413,'PDF excede o limite de 8 MB');return;}
       parts.push(part as Buffer);
     }
     const text=await extractPdfTextLocally(Buffer.concat(parts));
     reply(res,200,text);
   }catch(error){
     const safe=safeWorkerFailure(error);
     reply(res,422,safe==='Falha interna de processamento; contate a equipe de TI'
       ?'PDF inválido ou não foi possível extrair o texto':safe);
   }
 });
 server.requestTimeout=35000;
 return server;
}
export function startPdfParserServer(socket:string){
 if(!socket.startsWith('/')||socket.length>180)
   throw new Error('Caminho de socket inválido');
 // The socket lives on a private volume, never in a world-writeable /tmp.
 if(existsSync(socket)){
   if(!lstatSync(socket).isSocket())throw new Error('Caminho do socket ocupado');
   unlinkSync(socket);
 }
 const server=createPdfParserServer();
 server.listen(socket,()=>chmodSync(socket,0o660));
 return server;
}
if(process.argv[1]?.endsWith('pdf-parser-server.ts')||process.argv[1]?.endsWith('pdf-parser-server.js')){
 const socket=process.env.PDF_PARSER_SOCKET||'/run/suportai/pdf-parser.sock';
 startPdfParserServer(socket);
}
