import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type Server,type RequestListener} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {extractPdfViaSocket} from './pdf-socket-client.js';

const PDF=Buffer.from('%PDF-1.7\nsynthetic-fixture');

async function withFakeParser(
 handler: RequestListener,
 run: (socket: string) => Promise<void>
) {
 const directory=await mkdtemp(join(tmpdir(),'suportai-adversarial-ipc-'));
 const socket=join(directory,'parser.sock');
 const server:Server=createServer(handler);
 try {
  await new Promise<void>((resolve,reject)=>{
   server.once('error',reject);
   server.listen(socket,resolve);
  });
  await run(socket);
 } finally {
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  await rm(directory,{recursive:true,force:true});
 }
}

test('socket client rejects parser error text that is not an approved public label',async()=>{
 const secret='postgres://private-user:private-password@internal-db/sensitive';
 await withFakeParser((req,res)=>{
  req.resume();
  res.writeHead(422,{'content-type':'text/plain'});
  res.end(secret);
 },async socket=>{
  await assert.rejects(
   extractPdfViaSocket(PDF,socket),
   error=>error instanceof Error
    && error.message==='Leitor de PDF isolado recusou o documento'
    && !error.message.includes(secret)
  );
 });
});

test('socket client bounds unexpectedly large extracted text responses',async()=>{
 await withFakeParser((req,res)=>{
  req.resume();
  res.writeHead(200,{'content-type':'text/plain'});
  res.end(Buffer.alloc(2*1024*1024+1,65));
 },async socket=>{
  await assert.rejects(
   extractPdfViaSocket(PDF,socket),
   error=>error instanceof Error && error.message==='PDF excede o limite de texto extraído'
  );
 });
});

test('socket client rejects oversized PDFs before contacting a parser',async()=>{
 const oversized=Buffer.concat([
  Buffer.from('%PDF-1.7\n'),
  Buffer.alloc(8*1024*1024,65)
 ]);
 assert.throws(
  ()=>extractPdfViaSocket(oversized,'/run/suportai/not-mounted.sock'),
  /PDF excede o limite de 8 MB/
 );
});

test('socket client rejects a fake PDF header before contacting a parser',async()=>{
 assert.throws(
  ()=>extractPdfViaSocket(Buffer.from('NOT_A_PDF'),'/run/suportai/not-mounted.sock'),
  /PDF inválido/
 );
});

test('socket client refuses empty HTTP 200 responses instead of indexing empty text',async()=>{
 await withFakeParser((req,res)=>{
  req.resume();
  res.writeHead(200,{'content-type':'text/plain'});
  res.end('   ');
 },async socket=>{
  await assert.rejects(
   extractPdfViaSocket(PDF,socket),
   error=>error instanceof Error && error.message==='PDF sem texto extraível; necessário texto digital'
  );
 });
});
