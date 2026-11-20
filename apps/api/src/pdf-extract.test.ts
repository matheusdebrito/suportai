import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {PDFDocument,PDFName,PDFString,StandardFonts} from 'pdf-lib';
import {extractPdfText} from './pdf-extract.js';

test('PDF extraction runs in a subprocess and returns digital text',async()=>{
 const pdf=await PDFDocument.create();
 const page=pdf.addPage([600,400]);
 const font=await pdf.embedFont(StandardFonts.Helvetica);
 page.drawText('Procedimento de infraestrutura: verificar os backups e registrar evidências de cada execução.',{
   x:40,y:340,size:12,font,maxWidth:500
 });
 const result=await extractPdfText(Buffer.from(await pdf.save({useObjectStreams:false})));
 assert.match(result,/verificar os backups/);
});
test('invalid and scanned-like PDF inputs fail with actionable messages',async()=>{
 assert.throws(()=>extractPdfText(Buffer.from('this is not a PDF')),/PDF inválido/);
 const blank=await PDFDocument.create();
 blank.addPage([600,400]);
 const blankBytes=Buffer.from(await blank.save({useObjectStreams:false}));
 await assert.rejects(
   ()=>extractPdfText(blankBytes),
   /PDF sem texto extraível/
 );
});
test('page limits are checked before extracting the whole document',async()=>{
 const oversized=await PDFDocument.create();
 for(let i=0;i<201;i++)oversized.addPage([600,400]);
 const oversizedBytes=Buffer.from(await oversized.save({useObjectStreams:false}));
 await assert.rejects(
   ()=>extractPdfText(oversizedBytes),
   /limite de 200 páginas/
 );
});

test('oversized PDF payloads fail before starting a parser',()=>{
 const bytes=Buffer.alloc(8*1024*1024+1);
 bytes.write('%PDF-1.7');
 assert.throws(()=>extractPdfText(bytes),/PDF excede o limite de 8 MB/);
});

test('malformed content claiming to be PDF cannot publish extracted text',async()=>{
 const forged=Buffer.from('%PDF-1.7\n% intentionally malformed\n/Type /Catalog\nstream\nnot a document\nendstream');
 await assert.rejects(()=>extractPdfText(forged,1500),
   /PDF inválido|PDF sem texto extraível|Tempo limite/);
});

test('a PDF JavaScript action is never executed by text extraction',async()=>{
 const pdf=await PDFDocument.create();
 const page=pdf.addPage([640,420]);
 const font=await pdf.embedFont(StandardFonts.Helvetica);
 page.drawText('Documento ficticio: registrar resultado do teste de backup no laboratorio.',{
   x:40,y:300,size:12,font,maxWidth:550
 });
 pdf.addJavaScript('unsafe-action','throw new Error("PDF_JAVASCRIPT_EXECUTED");');
 const extracted=await extractPdfText(Buffer.from(await pdf.save({useObjectStreams:false})));
 assert.match(extracted,/registrar resultado do teste/);
 assert.doesNotMatch(extracted,/PDF_JAVASCRIPT_EXECUTED/);
});

test('a password-encrypted PDF is rejected without exposing parser internals',async()=>{
 const encrypted=await readFile(new URL('../test-fixtures/encrypted-lab.pdf',import.meta.url));
 assert.equal(encrypted.subarray(0,5).toString(),'%PDF-');
 assert.ok(encrypted.includes(Buffer.from('/Encrypt')));
 await assert.rejects(()=>extractPdfText(encrypted),
   /PDF inválido|PDF sem texto extraível|Não foi possível extrair/);
});

test('untrusted PDF URI actions do not trigger local network requests during extraction',async()=>{
 const requests:string[]=[];
 const server=createServer((req,res)=>{
   requests.push(req.url||'');
   res.writeHead(200,{'Content-Type':'text/plain'});
   res.end('unexpected request from PDF');
 });
 await new Promise<void>((resolve,reject)=>{
   server.once('error',reject);
   server.listen(0,'127.0.0.1',resolve);
 });
 try{
   const address=server.address();
   if(!address||typeof address==='string')throw new Error('Local canary port unavailable');
   const uri='http://127.0.0.1:'+address.port+'/external-pdf-link-canary';
   const pdf=await PDFDocument.create();
   const page=pdf.addPage([640,420]);
   const font=await pdf.embedFont(StandardFonts.Helvetica);
   page.drawText('Laboratorio ficticio: conferir registros e consultar o resultado de cada teste sem abrir links.',{
     x:35,y:330,size:12,font,maxWidth:550
   });
   const action=pdf.context.obj({S:PDFName.of('URI'),URI:PDFString.of(uri)});
   const annotation=pdf.context.obj({
     Type:PDFName.of('Annot'),Subtype:PDFName.of('Link'),
     Rect:[35,200,300,230],Border:[0,0,0],A:action
   });
   const annotationRef=pdf.context.register(annotation);
   page.node.set(PDFName.of('Annots'),pdf.context.obj([annotationRef]));
   const text=await extractPdfText(Buffer.from(await pdf.save({useObjectStreams:false})));
   assert.match(text,/conferir registros/);
   assert.deepEqual(requests,[],'A parser must never dereference a PDF URI action');
 }finally{
   await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});
