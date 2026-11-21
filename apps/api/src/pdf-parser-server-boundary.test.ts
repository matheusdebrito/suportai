import {test} from 'node:test';
import assert from 'node:assert/strict';
import {request,type Server} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPdfParserServer} from './pdf-parser-server.js';

async function withParser(run:(socket:string)=>Promise<void>){
 const directory=await mkdtemp(join(tmpdir(),'suportai-parser-boundary-'));
 const socket=join(directory,'parser.sock');
 const server:Server=createPdfParserServer();
 try{
  await new Promise<void>((resolve,reject)=>{
   server.once('error',reject);
   server.listen(socket,resolve);
  });
  await run(socket);
 }finally{
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  await rm(directory,{recursive:true,force:true});
 }
}
function send(socket:string,method:string,path:string,contentType:string,body:Buffer){
 return new Promise<{status:number;body:string}>((resolve,reject)=>{
  const req=request({socketPath:socket,method,path,headers:{
   'content-type':contentType,'content-length':body.length
  }},res=>{
   const chunks:Buffer[]=[];
   res.on('data',(chunk:Buffer)=>chunks.push(chunk));
   res.on('end',()=>resolve({status:res.statusCode??0,body:Buffer.concat(chunks).toString('utf8')}));
   res.on('error',reject);
  });
  req.on('error',reject);
  req.end(body);
 });
}
test('dedicated parser rejects unsupported routes and content types before extraction',async()=>{
 await withParser(async socket=>{
  const invalidRoute=await send(socket,'POST','/other','application/pdf',Buffer.from('%PDF-1.7\ninvalid'));
  assert.equal(invalidRoute.status,404);
  assert.equal(invalidRoute.body,'Not found');
  const invalidType=await send(socket,'POST','/extract','text/plain',Buffer.from('%PDF-1.7\ninvalid'));
  assert.equal(invalidType.status,415);
  assert.equal(invalidType.body,'PDF inválido');
 });
});
test('dedicated parser rejects declared oversized input before reading a request body',async()=>{
 await withParser(async socket=>{
  const result=await new Promise<{status:number;body:string}>((resolve,reject)=>{
   const req=request({socketPath:socket,method:'POST',path:'/extract',headers:{
    'content-type':'application/pdf','content-length':8*1024*1024+1
   }},res=>{
    const chunks:Buffer[]=[];
    res.on('data',(part:Buffer)=>chunks.push(part));
    res.on('end',()=>resolve({
     status:res.statusCode??0,body:Buffer.concat(chunks).toString('utf8')
    }));
    res.on('error',reject);
   });
   req.on('error',reject);
   req.end();
  });
  assert.equal(result.status,413);
  assert.equal(result.body,'PDF excede o limite de 8 MB');
 });
});
