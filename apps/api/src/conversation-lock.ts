import pg from 'pg';

// Use a small separate pool: an agent turn can take up to 60 seconds, so
// its advisory lock must not exhaust the application's ordinary query pool.
const locks=new pg.Pool({
 connectionString:process.env.DATABASE_URL,max:4,
 connectionTimeoutMillis:1_500,allowExitOnIdle:true
});
const NAMESPACE=314159;

/**
 * One turn per conversation across processes/containers. Busy requests fail
 * before recording a user message. A session-level advisory lock survives
 * multiple DB transactions and remains held while the model is responding.
 */
export async function withConversationTurnLock<T>(
 conversationId:string,work:()=>Promise<T>
):Promise<{busy:true;retryAfterMs:number}|{busy:false;value:T}>{
 const client=await locks.connect();
 let held=false;
 try{
  const result=await client.query(
   'SELECT pg_try_advisory_lock($1::int,hashtext($2::text)) AS locked',
   [NAMESPACE,conversationId]
  );
  held=result.rows[0]?.locked===true;
  if(!held)return {busy:true,retryAfterMs:2000};
  return {busy:false,value:await work()};
 }finally{
  if(held){
   try{await client.query('SELECT pg_advisory_unlock($1::int,hashtext($2::text))',[NAMESPACE,conversationId]);}
   catch{
    // Never return an advisory-lock-holding connection to the pool.
    client.release(true);
    throw new Error('Falha ao liberar a trava da conversa');
   }
  }
  client.release();
 }
}
