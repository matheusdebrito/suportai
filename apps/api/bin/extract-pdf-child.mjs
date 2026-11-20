import {PDFParse} from 'pdf-parse';

const MAX_BYTES=8*1024*1024;
const MAX_CHARS=450000;
let parser;
try{
 const parts=[];
 let inputSize=0;
 for await (const part of process.stdin){
   inputSize+=part.length;
   if(inputSize>MAX_BYTES)throw {exitCode:44};
   parts.push(part);
 }
 const bytes=Buffer.concat(parts);
 if(bytes.length<8||bytes.subarray(0,5).toString()!=='%PDF-')
   throw {exitCode:45};
 parser=new PDFParse({data:new Uint8Array(bytes)});
 const info=await parser.getInfo();
 if(info.total>200)throw {exitCode:43};
 const result=await parser.getText();
 const text=result.text||'';
 if(text.trim().length<40)throw {exitCode:42};
 if(text.length>MAX_CHARS)throw {exitCode:44};
 process.stdout.write(text);
}catch(error){
 // Do not print file content or parser internals into logs.
 const code=typeof error==='object'&&error!==null&&'exitCode' in error
   ? Number(error.exitCode) : 45;
 process.exitCode=code;
}finally{
 if(parser){
   try{await parser.destroy();}catch{process.exitCode ||=45;}
 }
}
