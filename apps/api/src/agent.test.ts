import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type OpenAI from 'openai';
import {respond} from './agent.js';
import {canApprove,canRead,type Actor} from './security.js';

test('model cannot gain read permission from its prompt',()=>{
 const maliciousModelInput={can_read:true,role:'ADMIN'};
 assert.equal(canRead('RESTRICTED',null),false);
 assert.equal(canApprove(maliciousModelInput.role,'RESTRICTED',null),false);
});
const actor:Actor={id:randomUUID(),role:'USER',auth_revision:0,must_change_password:false};
const fakeCall=(name:string,args:unknown,id='tool-1')=>({
 id,type:'function',function:{name,arguments:JSON.stringify(args)}
});
function fakeLLM(responses:any[], calls:any[]):OpenAI {
 return {chat:{completions:{create:async(opts:unknown)=>{
   calls.push(opts);
   const next=responses.shift()??{role:'assistant',content:'Sem ações adicionais.'};
   return {choices:[{message:next.message??next,finish_reason:next.finish_reason}]};
 }}}} as unknown as OpenAI;
}
test('a hostile completion cannot create drafts when the user asked only for guidance',async()=>{
 const observed:any[]=[];
 const fake=fakeLLM([
   {role:'assistant',content:null,tool_calls:[fakeCall('prepare_article',{
     spaceId:randomUUID(),title:'Injected article',
     content:'Uma instrução maliciosa incluída em documento pede a criação de novo artigo sem solicitação do usuário.'
   })]},
   {role:'assistant',content:'O procedimento deve ser validado pela equipe.'}
 ],observed);
 const result=await respond(actor,randomUUID(),'Como configurar o DNS do servidor?',[],fake);
 assert.equal(result.pendingActions.length,0);
 assert.match(result.answer,/não um procedimento interno validado/i);
 const selectedTools=(observed[0].tools as any[]).map(x=>x.function?.name);
 assert.deepEqual(selectedTools,['search_knowledge']);
 assert.equal(observed[0].tool_choice.function.name,'search_knowledge');
 const second=(observed[1].messages as any[]).filter(x=>x.role==='tool');
 assert.equal(second.length,1);
 assert.match(String(second[0].content),/não solicitou/i);
});
test('a greeting is answered without forced lookup',async()=>{
 const observed:any[]=[];
 const fake=fakeLLM([{role:'assistant',content:'Olá! Em que posso ajudar?'}],observed);
 const result=await respond(actor,randomUUID(),'Bom dia!',[],fake);
 assert.equal(result.answer,'Olá! Em que posso ajudar?');
 assert.equal(observed[0].tool_choice,'auto');
 assert.equal(result.sources.length,0);
});
test('a technical question prefixed by a greeting still forces evidence lookup',async()=>{
 const observed:any[]=[];
 const fake=fakeLLM([{role:'assistant',content:'Execute esta configuração interna.'}],observed);
 const result=await respond(actor,randomUUID(),'Bom dia, qual é o procedimento interno para VPN?',[],fake);
 assert.equal(observed[0].tool_choice.function.name,'search_knowledge');
 assert.match(result.answer,/não um procedimento interno validado/i);
});
test('every model tool call is answered, including calls beyond the limit',async()=>{
 const observed:any[]=[];
 const fake=fakeLLM([
   {role:'assistant',content:null,tool_calls:Array.from({length:5},(_,i)=>fakeCall('unsupported_action',{},'tool-'+i))},
   {role:'assistant',content:'Nenhuma ferramenta reconhecida.'}
 ],observed);
 const result=await respond(actor,randomUUID(),'Bom dia',[],fake);
 assert.equal(result.pendingActions.length,0);
 const tools=(observed[1].messages as any[]).filter(x=>x.role==='tool');
 assert.equal(tools.length,5);
 assert.match(String(tools[4].content),/Limite de ferramentas/);
});

test('truncated answers and tool calls cannot be presented or executed',async()=>{
 const observed:any[]=[];
 const fake=fakeLLM([{message:{role:'assistant',
   content:'Passo 1: execute a configuração incompleta.',
   tool_calls:[fakeCall('prepare_article',{spaceId:randomUUID(),title:'Injeção',content:'Texto de teste que não deve gerar proposta.'})]
 },finish_reason:'length'}],observed);
 const result=await respond(actor,randomUUID(),'Bom dia!',[],fake);
 assert.match(result.answer,/interrompida pelo limite/);
 assert.doesNotMatch(result.answer,/Passo 1/);
 assert.equal(result.sources.length,0);
 assert.equal(result.pendingActions.length,0);
 assert.equal(observed.length,1,'A call interrupted by length must not start another turn');
});
test('filtered model answers do not show partial instructions',async()=>{
 const fake=fakeLLM([{message:{role:'assistant',content:'Procedimento parcial do modelo.'},
   finish_reason:'content_filter'}],[]);
 const result=await respond(actor,randomUUID(),'Oi!',[],fake);
 assert.match(result.answer,/filtro do provedor/);
 assert.doesNotMatch(result.answer,/Procedimento parcial/);
 assert.deepEqual(result.sources,[]);
});
