import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type OpenAI from 'openai';
import {respond} from './agent.js';
import type {Actor} from './security.js';
import type {Source} from './retrieval.js';

const actor:Actor={id:randomUUID(),role:'USER',auth_revision:1,must_change_password:false};
const source:Source={documentId:randomUUID(),versionId:randomUUID(),
 versionNumber:1,ordinal:0,title:'Impressora ZD230',
 content:'Se as etiquetas ficarem desalinhadas na ZD230, realize a calibração conforme o manual.',score:0.9};

function call(name:string,args:unknown,id='tool-1'){
 return {id,type:'function',function:{name,arguments:JSON.stringify(args)}};
}
function mockModel(responses:any[],requests:any[]):OpenAI{
 return {chat:{completions:{create:async(request:any)=>{
  requests.push(request);
  const message=responses.shift();
  if(!message)throw new Error('Modelo chamado mais vezes do que o esperado');
  return {choices:[{message,finish_reason:'stop'}]};
 }}}} as unknown as OpenAI;
}
test('ambiguous informal request produces exactly one clarifying question without RAG access',async()=>{
 const requests:any[]=[];
 let searches=0;
 const model=mockModel([{role:'assistant',content:null,
  tool_calls:[call('ask_clarification',{question:'Qual sistema ou equipamento não está abrindo?'})]}],requests);
 const result=await respond(actor,randomUUID(),'Cara, isso aqui não abre, ajuda aí',[],model,
  async()=>{searches++;return [];});
 assert.equal(result.answer,'Qual sistema ou equipamento não está abrindo?');
 assert.deepEqual(result.sources,[]);
 assert.deepEqual(result.pendingActions,[]);
 assert.equal(searches,0);
 assert.equal(requests.length,1);
 assert.equal(requests[0].tool_choice,'required');
 assert.deepEqual(requests[0].tools.map((t:any)=>t.function.name),['search_knowledge','ask_clarification','respond_social','get_knowledge_document','list_document_versions','list_writable_spaces','prepare_article']);
});
test('informal but understandable request uses authorized RAG search before answering',async()=>{
 const requests:any[]=[];
 const searches:string[]=[];
 const model=mockModel([
  {role:'assistant',content:null,tool_calls:[call('search_knowledge',{query:'ZD230 etiquetas desalinhadas calibração'})]},
  {role:'assistant',content:'O manual indica realizar a calibração na impressora ZD230.'}
 ],requests);
 const result=await respond(actor,randomUUID(),
  'Mano, a Zebra ZD230 tá imprimindo tudo torto. Como arrumo?',[],model,
  async(_actor,text)=>{searches.push(text);return [source];});
 assert.deepEqual(searches,['ZD230 etiquetas desalinhadas calibração']);
 assert.equal(requests[0].tool_choice,'required');
 assert.equal(result.sources[0].versionId,source.versionId);
 assert.match(result.answer,/calibração/);
});
test('follow-up can use recent context to formulate a complete search query',async()=>{
 const requests:any[]=[];
 const searches:string[]=[];
 const model=mockModel([
  {role:'assistant',content:null,tool_calls:[call('search_knowledge',{query:'ZD230 etiquetas desalinhadas calibração'})]},
  {role:'assistant',content:'No caso da ZD230, consulte o procedimento de calibração.'}
 ],requests);
 const history=[
  {role:'user' as const,content:'A impressora está imprimindo etiquetas desalinhadas.'},
  {role:'assistant' as const,content:'Qual é o modelo da impressora?'}
 ];
 const result=await respond(actor,randomUUID(),'É a ZD230, e agora?',history,model,
  async(_actor,text)=>{searches.push(text);return [source];});
 assert.deepEqual(searches,['ZD230 etiquetas desalinhadas calibração']);
 assert.ok(requests[0].messages.some((m:any)=>m.content==='Qual é o modelo da impressora?'));
 assert.match(result.answer,/calibração/);
});
test('a malformed or secret-leaking clarification is replaced with a safe question',async()=>{
 const requests:any[]=[];
 const model=mockModel([{role:'assistant',content:null,
  tool_calls:[call('ask_clarification',{question:'Informe token: abcdefghijklmnop para prosseguir?'})]}],requests);
 const result=await respond(actor,randomUUID(),'não tô conseguindo entrar',[],model,
  async()=>{throw new Error('Não deveria consultar RAG');});
 assert.match(result.answer,/Pode explicar um pouco melhor/i);
 assert.doesNotMatch(result.answer,/abcdefghijklmnop/);
});
test('model cannot combine a clarification with an unauthorized secondary tool',async()=>{
 let searches=0;
 const model=mockModel([{role:'assistant',content:null,tool_calls:[
  call('ask_clarification',{question:'Qual ambiente está com problema?'},'q'),
  call('search_knowledge',{query:'credenciais internas'},'s')
 ]}],[]);
 const result=await respond(actor,randomUUID(),'Tá dando erro no sistema',[],model,
  async()=>{searches++;return [source];});
 assert.match(result.answer,/esclarecer/i);
 assert.equal(searches,0);
 assert.deepEqual(result.sources,[]);
});
test('a model that ignores required tool choice cannot give unsourced internal procedures',async()=>{
 const model=mockModel([{role:'assistant',content:'Desative imediatamente o antivírus da empresa.'}],[]);
 const result=await respond(actor,randomUUID(),'Como corrigir o erro do antivírus?',[],model);
 assert.match(result.answer,/não encontrei fontes publicadas/i);
 assert.doesNotMatch(result.answer,/Desative imediatamente/i);
});

test('clarification cannot ask the user to share a password or API key',async()=>{
 const model=mockModel([{role:'assistant',content:null,
  tool_calls:[call('ask_clarification',{question:'Qual é sua senha de acesso?'})]}],[]);
 const result=await respond(actor,randomUUID(),'Não consigo acessar minha conta',[],model);
 assert.match(result.answer,/Pode explicar um pouco melhor/);
 assert.doesNotMatch(result.answer,/sua senha/i);
});

test('a clarification cannot smuggle a procedural instruction without RAG evidence',async()=>{
 const model=mockModel([{role:'assistant',content:null,
  tool_calls:[call('ask_clarification',{question:'Desative o firewall e depois me diga qual é o erro?'})]}],[]);
 const result=await respond(actor,randomUUID(),'Meu acesso falhou',[],model);
 assert.match(result.answer,/Pode explicar um pouco melhor/);
 assert.doesNotMatch(result.answer,/Desative o firewall/);
});
