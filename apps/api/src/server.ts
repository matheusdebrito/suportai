import './env.js';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import {pool,query} from './db.js';
import {registerAuth} from './auth.js';
import {registerKnowledge} from './knowledge.js';
import {registerChat} from './chat.js';
import {registerOperations} from './operations.js';
import {respond} from './agent.js';
export async function buildApp(options:{agentResponder?:typeof respond}={}){
 const app=Fastify({logger:{redact:['req.headers.authorization','req.headers.cookie','res.headers.set-cookie']},bodyLimit:200_000});
 const origin=process.env.APP_ORIGIN||'http://localhost:5173';
 await app.register(cors,{origin,credentials:true});
 await app.register(cookie);
 await app.register(multipart,{limits:{fileSize:8*1024*1024,files:1}});
 app.addHook('onRequest',async(req,reply)=>{
   if(['POST','PATCH','PUT','DELETE'].includes(req.method) && req.headers.cookie){
     if(req.headers.origin!==origin) return reply.code(403).send({error:'Origem não autorizada'});
   }
 });
 app.get('/health',async()=>({status:'ok'}));
 app.get('/ready',async(req,reply)=>{
   try{await query('SELECT 1');return {status:'ready'};}
   catch{return reply.code(503).send({status:'unavailable'});}
 });
 registerAuth(app);
 registerOperations(app);
 registerKnowledge(app);
 registerChat(app,options.agentResponder??respond);
 app.setErrorHandler((error,req,reply)=>{
   const err=error as Error & {statusCode?:number};
   const code=typeof err.statusCode==='number' && err.statusCode>=400 && err.statusCode<500?err.statusCode:500;
   if(code===500) req.log.error({err:err.message},'Request failed');
   reply.code(code).send({error:code===500?'Erro interno':err.message});
 });
 return app;
}
if(process.env.NODE_ENV!=='test'){
 const app=await buildApp();
 const port=Number(process.env.API_PORT||4000);
 await app.listen({port,host:'0.0.0.0'});
 const shutdown=async()=>{await app.close();await pool.end();};
 process.on('SIGTERM',()=>{void shutdown();});
 process.on('SIGINT',()=>{void shutdown();});
}
