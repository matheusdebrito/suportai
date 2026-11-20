import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import type {Server} from 'node:http';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {createPdfParserServer} from './pdf-parser-server.js';
import {extractPdfViaSocket} from './pdf-socket-client.js';
import {extractPdfText} from './pdf-extract.js';

test('dedicated Unix-socket parser transports synthetic PDF without DB or AI',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'suportai-parser-'));
 const socket=join(directory,'parser.sock');
 const server:Server=createPdfParserServer();
 try{
   await new Promise<void>((resolve,reject)=>{
     server.once('error',reject);
     server.listen(socket,resolve);
   });
   const pdf=await PDFDocument.create();
   const page=pdf.addPage([610,420]);
   const font=await pdf.embedFont(StandardFonts.Helvetica);
   page.drawText('Laboratorio ficticio: registrar e conferir as evidencias de backup semanal.',{
     x:30,y:310,size:12,font
   });
   const output=await extractPdfViaSocket(Buffer.from(await pdf.save({useObjectStreams:false})),socket);
   assert.match(output,/backup semanal/);
   await assert.rejects(()=>extractPdfViaSocket(Buffer.from('%PDF-1.7\nnot-real'),socket),/PDF inválido/);
 }finally{
   await new Promise<void>(resolve=>server.close(()=>resolve()));
   await rm(directory,{recursive:true,force:true});
 }
});
test('production refuses PDF parsing without a configured isolated socket',()=>{
 const previousMode=process.env.NODE_ENV,previousSocket=process.env.PDF_PARSER_SOCKET;
 try{
   process.env.NODE_ENV='production';
   delete process.env.PDF_PARSER_SOCKET;
   assert.throws(()=>extractPdfText(Buffer.from('%PDF-1.7\nunit test')),
     /Leitor de PDF isolado não configurado/);
 }finally{
   if(previousMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousMode;
   if(previousSocket===undefined)delete process.env.PDF_PARSER_SOCKET;else process.env.PDF_PARSER_SOCKET=previousSocket;
 }
});
test('unavailable socket produces a controlled error without revealing filesystem path',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'suportai-parser-'));
 try{
   await assert.rejects(
     ()=>extractPdfViaSocket(Buffer.from('%PDF-1.7\nunit test'),join(directory,'absent.sock')),
     e=>e instanceof Error && e.message==='Leitor de PDF isolado indisponível'
   );
 }finally{await rm(directory,{recursive:true,force:true});}
});
