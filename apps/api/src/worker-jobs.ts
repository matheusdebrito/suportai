import {pool,query,transaction} from './db.js';

export type ClaimedJob={versionId:string;leaseToken:string;attempts:number};

export async function claimJob():Promise<ClaimedJob|null>{
 const r=await query('WITH candidate AS ('+
   'SELECT version_id FROM ingestion_jobs WHERE status=\'PENDING\' OR '+
   '(status=\'RUNNING\' AND updated_at<now()-interval \'5 minutes\' AND attempts<3) '+
   'ORDER BY updated_at,version_id FOR UPDATE SKIP LOCKED LIMIT 1) '+
   'UPDATE ingestion_jobs j SET status=\'RUNNING\',attempts=j.attempts+1, '+
   'lease_token=gen_random_uuid(),updated_at=now(),error=NULL '+
   'FROM candidate WHERE j.version_id=candidate.version_id '+
   'RETURNING j.version_id,j.lease_token,j.attempts');
 const x=r.rows[0];
 return x?{versionId:x.version_id,leaseToken:x.lease_token,attempts:Number(x.attempts)}:null;
}
export async function renewLease(job:ClaimedJob):Promise<boolean>{
 const r=await query('UPDATE ingestion_jobs SET updated_at=now() '+
   "WHERE version_id=$1 AND lease_token=$2 AND status='RUNNING' RETURNING version_id",
   [job.versionId,job.leaseToken]);
 return Boolean(r.rowCount);
}
export async function storeClaimedResult(
 job:ClaimedJob,text:string,parts:string[],vectors:(number[]|null)[]
):Promise<boolean>{
 if(parts.length!==vectors.length)throw new Error('Quantidade inconsistente de trechos e embeddings');
 const client=await pool.connect();
 try{
   await client.query('BEGIN');
   const current=await client.query("SELECT version_id FROM ingestion_jobs WHERE "+
     "version_id=$1 AND lease_token=$2 AND status='RUNNING' FOR UPDATE",
     [job.versionId,job.leaseToken]);
   if(!current.rowCount){
     await client.query('ROLLBACK');
     return false;
   }
   await client.query('DELETE FROM knowledge_chunks WHERE version_id=$1',[job.versionId]);
   for(let i=0;i<parts.length;i++)
     await client.query('INSERT INTO knowledge_chunks(version_id,ordinal,content,embedding) VALUES($1,$2,$3,$4::vector)',
       [job.versionId,i,parts[i],vectors[i]?JSON.stringify(vectors[i]):null]);
   await client.query("UPDATE document_versions SET index_status='READY',content=$2 WHERE id=$1",
     [job.versionId,text]);
   await client.query("UPDATE ingestion_jobs SET status='DONE',lease_token=NULL,error=NULL,updated_at=now() WHERE version_id=$1",
     [job.versionId]);
   await client.query('COMMIT');
   return true;
 }catch(error){
   await client.query('ROLLBACK');
   throw error;
 }finally{client.release();}
}
export async function failClaimedJob(job:ClaimedJob,error:string):Promise<boolean>{
 return transaction(async c=>{
   const changed=await c.query("UPDATE ingestion_jobs SET status='FAILED',lease_token=NULL,error=$3,updated_at=now() "+
     "WHERE version_id=$1 AND lease_token=$2 AND status='RUNNING' RETURNING version_id",
     [job.versionId,job.leaseToken,error.slice(0,250)]);
   if(changed.rowCount)
     await c.query("UPDATE document_versions SET index_status='FAILED' WHERE id=$1",[job.versionId]);
   return Boolean(changed.rowCount);
 });
}
export async function expireStaleJobs():Promise<number>{
 return transaction(async c=>{
   const expired=await c.query("UPDATE ingestion_jobs SET status='FAILED',lease_token=NULL, "+
     "error='Limite de tentativas de processamento excedido',updated_at=now() "+
     "WHERE status='RUNNING' AND attempts>=3 AND updated_at<now()-interval '5 minutes' RETURNING version_id");
   const ids=expired.rows.map(x=>x.version_id) as string[];
   if(ids.length)
     await c.query("UPDATE document_versions SET index_status='FAILED' WHERE id=ANY($1::uuid[])",[ids]);
   return ids.length;
 });
}
