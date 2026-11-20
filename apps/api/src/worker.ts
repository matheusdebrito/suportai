import {PDFParse} from 'pdf-parse';
import {pool,query} from './db.js';
import {chunks,hasSecrets} from './knowledge.js';
import {embedText} from './llm.js';
async function processNext():Promise<boolean>{
 const claim=await query(`UPDATE ingestion_jobs SET status='RUNNING',attempts=attempts+1,updated_at=now()
 WHERE version_id=(SELECT version_id FROM ingestion_jobs WHERE status='PENDING' OR (status='RUNNING' AND updated_at<now()-interval '5 minutes')
 ORDER BY updated_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING version_id`);
 const id=claim.rows[0]?.version_id;
 if(!id) return false;
 try{
   const r=await query('SELECT content,pdf_bytes FROM document_versions WHERE id=$1',[id]);
   if(!r.rowCount) throw new Error('Versão inexistente');
   let text=r.rows[0].content as string;
   if(r.rows[0].pdf_bytes){
     const bytes=r.rows[0].pdf_bytes as Buffer;
     // The legacy v1 parser silently rejected valid PDFs with "bad XRef entry".
     // v2 explicitly frees its parser resources after extraction.
     const parser=new PDFParse({data:new Uint8Array(bytes)});
     try{
       const info=await parser.getInfo();
       if(info.total>200) throw new Error('PDF excede o limite de 200 páginas');
       const parsed=await parser.getText();
       text=parsed.text;
     }finally{
       await parser.destroy();
     }
     if(text.trim().length<40) throw new Error('PDF sem texto extraível; necessário texto digital');
   }
   if(hasSecrets(text)) throw new Error('Possível credencial detectada; revisão necessária');
   if(!text.trim()) throw new Error('Documento vazio');
   if(text.length>450000) throw new Error('Documento muito extenso; divida-o em arquivos menores');
   const parts=chunks(text);
   if(parts.length>500) throw new Error('Quantidade de trechos excede o limite; processamento interrompido');
   const vectors:(number[]|null)[]=[];
   for(const part of parts){
     try {vectors.push(await embedText(part));}
     catch {vectors.push(null);}
   }
   const client=await pool.connect();
   try {
     await client.query('BEGIN');
     await client.query('DELETE FROM knowledge_chunks WHERE version_id=$1',[id]);
     for(let i=0;i<parts.length;i++) await client.query('INSERT INTO knowledge_chunks(version_id,ordinal,content,embedding) VALUES($1,$2,$3,$4::vector)',[id,i,parts[i],vectors[i]?JSON.stringify(vectors[i]):null]);
     await client.query("UPDATE document_versions SET index_status='READY',content=$2 WHERE id=$1",[id,text]);
     await client.query("UPDATE ingestion_jobs SET status='DONE',error=NULL,updated_at=now() WHERE version_id=$1",[id]);
     await client.query('COMMIT');
   } catch(e){await client.query('ROLLBACK');throw e;} finally{client.release();}
 }catch(e){
   const message=e instanceof Error?e.message:'Falha desconhecida';
   await query("UPDATE ingestion_jobs SET status='FAILED',error=$2,updated_at=now() WHERE version_id=$1",[id,message.slice(0,250)]);
   await query("UPDATE document_versions SET index_status='FAILED' WHERE id=$1",[id]);
 }
 return true;
}
if(process.env.NODE_ENV==='test') throw new Error('Worker not executed in tests');
const stop=()=>{running=false;};
let running=true;
process.on('SIGTERM',stop);
process.on('SIGINT',stop);
while(running) {
 const found=await processNext().catch(e=>{console.error('Worker job failure',e instanceof Error?e.message:'unknown');return false;});
 if(!found) await new Promise(r=>setTimeout(r,1500));
}
await pool.end();
