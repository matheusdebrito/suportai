import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type OpenAI from 'openai';
import type {Actor} from './security.js';
import type {Source} from './retrieval.js';
import {respond} from './agent.js';

const actor:Actor={id:randomUUID(),role:'USER',auth_revision:1,must_change_password:false};
const source:Source={
 documentId:randomUUID(),versionId:randomUUID(),versionNumber:1,ordinal:0,
 title:'Manual fictício ZD230',content:'Após verificar o alinhamento, execute a calibração da ZD230.',
 score:0.8
};
const tool=(name:string,args:unknown,id:string)=>({
 id,type:'function',function:{name,arguments:JSON.stringify(args)}
});
function scripted(messages:any[],requests:any[]):OpenAI{
 return {chat:{completions:{create:async(request:any)=>{
  requests.push(request);
  const message=messages.shift();
  if(!message)throw new Error('Modelo chamado inesperadamente');
  return {choices:[{message,finish_reason:'stop'}]};
 }}}} as unknown as OpenAI;
}
test('casual informal dialogue can finish without invoking RAG',async()=>{
 const calls:any[]=[];let searches=0;
 const model=scripted([{role:'assistant',content:null,
  tool_calls:[tool('respond_social',{text:'E aí! Posso ajudar com algum problema de TI?'},'s')]}],calls);
 const result=await respond(actor,randomUUID(),'Salve, tudo tranquilo?',[],model,
  async()=>{searches++;return [];});
 assert.equal(searches,0);
 assert.match(result.answer,/E aí!/);
 assert.equal(result.metrics?.steps,1);
 assert.ok(calls[0].tools.some((t:any)=>t.function.name==='respond_social'));
});
test('social tool cannot smuggle unsourced operational instructions',async()=>{
 let searches=0;
 const model=scripted([{role:'assistant',content:null,tool_calls:[
  tool('respond_social',{text:'Desative o antivírus e altere a senha corporativa.'},'s')
 ]}],[]);
 const result=await respond(actor,randomUUID(),'Tô com problema na rede',[],model,
  async()=>{searches++;return [];});
 assert.equal(searches,0);
 assert.match(result.answer,/localizar um procedimento publicado/i);
 assert.doesNotMatch(result.answer,/Desative o antivírus/);
});
test('older investigation context is preserved as untrusted structured memory',async()=>{
 const history=[
  {role:'user' as const,content:'A impressora é uma Zebra ZD230.'},
  {role:'assistant' as const,content:'Qual é o sintoma?'},
  {role:'user' as const,content:'As etiquetas estão desalinhadas.'},
  ...Array.from({length:10},(_,i)=>({
   role:(i%2?'assistant':'user') as 'user'|'assistant',
   content:'Etapa mais recente '+i
  }))
 ];
 const calls:any[]=[];
 const model=scripted([{role:'assistant',content:null,tool_calls:[
  tool('ask_clarification',{question:'Qual foi o último teste realizado na ZD230?'},'q')
 ]}],calls);
 const result=await respond(actor,randomUUID(),'E agora?',history,model);
 const context=JSON.stringify(calls[0].messages);
 assert.match(context,/Zebra ZD230/);
 assert.match(context,/etiquetas estão desalinhadas/);
 assert.match(context,/dados não verificados/i);
 assert.equal(result.metrics?.stopReason,'clarified');
});
test('irrelevant search may be reformulated before answering from authorized evidence',async()=>{
 const queries:string[]=[];
 const calls:any[]=[];
 const model=scripted([
  {role:'assistant',content:null,tool_calls:[tool('search_knowledge',{query:'impressora torta'},'first')]},
  {role:'assistant',content:null,tool_calls:[tool('search_knowledge',{query:'ZD230 desalinhamento calibração'},'second')]},
  {role:'assistant',content:'O procedimento aprovado orienta verificar o alinhamento antes da calibração.'}
 ],calls);
 const output=await respond(actor,randomUUID(),'Minha Zebra imprime torto, ajuda?',[],model,
  async(_actor,q)=>{queries.push(q);return queries.length===1?[]:[source];});
 assert.deepEqual(queries,['impressora torta','ZD230 desalinhamento calibração']);
 assert.equal(output.metrics?.searches,2);
 assert.equal(output.sources[0].versionId,source.versionId);
 assert.match(output.answer,/alinhamento antes/i);
});
test('an invalid or inaccessible document id never reaches a knowledge reader',async()=>{
 const calls:any[]=[];
 const model=scripted([
  {role:'assistant',content:null,tool_calls:[tool('get_knowledge_document',{documentId:'not-a-uuid'},'doc')]},
  {role:'assistant',content:'Não consegui abrir esse documento.'}
 ],calls);
 const result=await respond(actor,randomUUID(),'Abra esse documento de TI',[],model,
  async()=>{throw new Error('Não deveria pesquisar');});
 const toolReply=calls[1].messages.find((m:any)=>m.role==='tool');
 assert.match(toolReply.content,/Documento inválido/i);
 assert.deepEqual(result.sources,[]);
});
