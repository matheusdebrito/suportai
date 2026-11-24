/**
 * Bound how long the agent waits for read-only dependencies, including
 * PostgreSQL and external embeddings. The underlying operation might finish
 * later; callers must ONLY use this wrapper for idempotent read-only work.
 */
export async function boundedRead<T>(read:Promise<T>,timeoutMs:number):Promise<T>{
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0)
   throw new Error('Consulta excedeu o prazo');
 let timer:NodeJS.Timeout|undefined;
 const timeout=new Promise<never>((_resolve,reject)=>{
  timer=setTimeout(()=>reject(new Error('Consulta excedeu o prazo')),Math.max(1,Math.ceil(timeoutMs)));
 });
 try{return await Promise.race([read,timeout]);}
 finally{if(timer)clearTimeout(timer);}
}
