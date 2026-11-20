import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,StandardFonts} from 'pdf-lib';
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
 await assert.rejects(()=>extractPdfText(Buffer.from('this is not a PDF')),/PDF inválido/);
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
