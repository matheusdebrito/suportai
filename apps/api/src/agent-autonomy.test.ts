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

test('rejected synthesis never leaks invented instructions and falls back to an attributed relevant passage',async()=>{
 const calls:any[]=[];
 const model=scripted([
  {role:'assistant',content:null,tool_calls:[tool('search_knowledge',{query:'ZD230 calibração'},'q1')]},
  {role:'assistant',content:'Reinicie o serviço antes de qualquer verificação.'},
  {role:'assistant',content:'{"verdict":"unsupported"}'},
  {role:'assistant',content:'Reinicie o serviço antes de qualquer verificação.'},
  {role:'assistant',content:'{"verdict":"unsupported"}'}
 ],calls);
 const result=await respond(actor,randomUUID(),'Qual o procedimento da ZD230?',[],model,
  async()=>[source],{verifyEvidence:true});
 assert.equal(result.metrics?.steps,5);
 assert.equal(result.metrics?.stopReason,'answered');
 assert.equal(result.metrics?.verifierRejections,2);
 assert.equal(result.metrics?.lastVerifierFailure,'model_rejected');
 assert.equal(result.metrics?.literalFallbacks,1);
 assert.equal(result.sources[0]?.versionId,source.versionId);
 assert.match(result.answer,/trecho original/);
 assert.doesNotMatch(result.answer,/Reinicie o serviço antes/i);
 assert.equal(calls[2].response_format.type,'json_object');
});
test('independent verifier accepts a grounded answer when supported',async()=>{
 const calls:any[]=[];
 const model=scripted([
  {role:'assistant',content:null,tool_calls:[tool('search_knowledge',{query:'ZD230 calibração'},'q1')]},
  {role:'assistant',content:'Verifique o alinhamento antes da calibração na ZD230.'},
  {role:'assistant',content:JSON.stringify({verdict:'supported',claims:[{unit:1,kind:'current',refs:[{evidence:1,quote:source.content}]}]})}
 ],calls);
 const result=await respond(actor,randomUUID(),'Qual o procedimento da ZD230?',[],model,
  async()=>[source],{verifyEvidence:true});
 assert.equal(result.metrics?.stopReason,'answered');
 assert.equal(result.sources[0]?.versionId,source.versionId);
 assert.deepEqual(result.sources[0]?.excerpts,[source.content]);
 assert.match(result.answer,/\[1\]$/);
 assert.match(result.answer,/alinhamento antes/i);
});

test('technical clarification recovers contextual evidence before asking for an unknown model',async()=>{
 const queries:string[]=[];const requests:any[]=[];
 const model=scripted([
  {role:'assistant',content:null,tool_calls:[tool('ask_clarification',{question:'Qual é o modelo exato?'},'q')]},
  {role:'assistant',content:'Verifique o alinhamento antes da calibração na ZD230.'},
  {role:'assistant',content:JSON.stringify({verdict:'supported',claims:[{unit:1,kind:'current',refs:[{evidence:1,quote:source.content}]}]})}
 ],requests);
 const result=await respond(actor,randomUUID(),'Não sei o modelo.',[
  {role:'user',content:'Preciso configurar uma impressora.'},
  {role:'assistant',content:'Qual a marca?'},
  {role:'user',content:'Zebra'},
  {role:'assistant',content:'Qual o modelo?'}
 ],model,async(_actor,q)=>{queries.push(q);return [source];},{verifyEvidence:true});
 assert.match(queries[0],/configurar.*Zebra/i);
 assert.equal(result.metrics?.stopReason,'answered');assert.match(result.answer,/alinhamento/);
 assert.equal(result.sources[0]?.versionId,source.versionId);
});
test('verified partial response omits unsupported independent claim',async()=>{
 const model=scripted([
  {role:'assistant',content:null,tool_calls:[tool('search_knowledge',{query:'ZD230 calibração'},'q')]},
  {role:'assistant',content:'Verifique o alinhamento antes da calibração na ZD230. Reinicie o servidor.'},
  {role:'assistant',content:JSON.stringify({verdict:'supported',claims:[{unit:1,kind:'current',refs:[{evidence:1,quote:source.content}]},{unit:2,kind:'omitted',refs:[]}]})}
 ],[]);
 const result=await respond(actor,randomUUID(),'Qual o procedimento da ZD230?',[],model,async()=>[source],{verifyEvidence:true});
 assert.match(result.answer,/alinhamento/);assert.doesNotMatch(result.answer,/Reinicie o servidor/);assert.match(result.answer,/parte verificada/);
 assert.equal(result.sources.length,1);
});

test('independent verifier rejection triggers bounded grounded rewrite',async()=>{
 const model=scripted([
  {role:'assistant',content:null,tool_calls:[tool('search_knowledge',{query:'calibração ZD230'},'q')]},
  {role:'assistant',content:'Reinicie o servidor.'},
  {role:'assistant',content:'{"verdict":"unsupported"}'},
  {role:'assistant',content:'Verifique o alinhamento antes da calibração na ZD230.'},
  {role:'assistant',content:JSON.stringify({verdict:'supported',claims:[{unit:1,kind:'current',refs:[{evidence:1,quote:source.content}]}]})}
 ],[]);
 const result=await respond(actor,randomUUID(),'Como configurar a ZD230?',[],model,async()=>[source],{verifyEvidence:true});
 assert.equal(result.metrics?.steps,5);assert.equal(result.metrics?.stopReason,'answered');assert.match(result.answer,/alinhamento/);assert.doesNotMatch(result.answer,/Reinicie/);
});

test('generic phone setup after unknown model returns verified documented operational values',async()=>{
 const phoneSource:Source={...source,title:'Manual de telefone Grandstream',content:'Abra a interface web pelo IP. Senha: fixture-device-only. Configure a conta SIP.'};
 const answer='Abra a interface web pelo IP. Senha: fixture-device-only. Configure a conta SIP.';
 const queries:string[]=[];
 const model=scripted([
  {role:'assistant',content:null,tool_calls:[tool('ask_clarification',{question:'Qual é o modelo exato?'},'q')]},
  {role:'assistant',content:answer},
  {role:'assistant',content:JSON.stringify({verdict:'supported',claims:[
   {unit:1,kind:'current',refs:[{evidence:1,quote:'Abra a interface web pelo IP.'}]},
   {unit:2,kind:'current',refs:[{evidence:1,quote:'Senha: fixture-device-only.'}]},
   {unit:3,kind:'current',refs:[{evidence:1,quote:'Configure a conta SIP.'}]}
  ]})}
 ],[]);
 const result=await respond(actor,randomUUID(),'Não sei o modelo.',[
  {role:'user',content:'Preciso configurar um telefone.'},
  {role:'assistant',content:'Qual a marca?'},
  {role:'user',content:'Grandstream'},
  {role:'assistant',content:'Qual o modelo?'}
 ],model,async(_actor,q)=>{queries.push(q);return [phoneSource];},{verifyEvidence:true});
 assert.match(queries[0],/telefone.*Grandstream/i);
 assert.equal(result.metrics?.stopReason,'answered');
 assert.match(result.answer,/fixture-device-only/);
 assert.match(result.answer,/Configure a conta SIP/);
 assert.equal(result.sources[0]?.versionId,phoneSource.versionId);
});

test('generic phone setup recovers a literal scoped procedure after two verifier rejections',async()=>{
 const phone:Source={...source,title:'Configuração de telefone fixo Grandstream',content:'# Ver o IP\nSegure o botão central.\nStatus > Network Status > IPV4\n# Configurar SIP\nAbra Accounts > General Settings.\nAccount Active: YES\nSIP Server: sip.example.test'};
 const queries:string[]=[];
 const model=scripted([
  {role:'assistant',content:null,tool_calls:[tool('ask_clarification',{question:'Qual a marca do telefone?'},'q')]},
  {role:'assistant',content:'Reinicie o servidor.'},
  {role:'assistant',content:'{"verdict":"unsupported"}'},
  {role:'assistant',content:'Configure uma porta não documentada.'},
  {role:'assistant',content:'{"verdict":"unsupported"}'}
 ],[]);
 const result=await respond(actor,randomUUID(),'Preciso configurar um telefone fixo',[],model,async(_actor,q)=>{queries.push(q);return [phone];},{verifyEvidence:true});
 assert.equal(result.metrics?.literalFallbacks,1);
 assert.equal(result.metrics?.verifierChecks,2);
 assert.match(result.answer,/Grandstream/);assert.match(result.answer,/Network Status/);
 assert.match(result.answer,/Account Active: YES/);assert.doesNotMatch(result.answer,/Reinicie o servidor|porta não documentada/);
 assert.equal(result.sources[0]?.versionId,phone.versionId);
});
test('recovery search can add a missing procedure before re-verification',async()=>{
 const extra:Source={...source,ordinal:1,content:'A calibração deve ser feita pelo painel.'};
 const queries:string[]=[];
 const model=scripted([
  {role:'assistant',content:null,tool_calls:[tool('search_knowledge',{query:'calibração'},'q')]},
  {role:'assistant',content:'Use o painel.'},
  {role:'assistant',content:'{"verdict":"unsupported"}'},
  {role:'assistant',content:'A calibração deve ser feita pelo painel.'},
  {role:'assistant',content:JSON.stringify({verdict:'supported',claims:[{unit:1,kind:'current',refs:[{evidence:2,quote:extra.content}]}]})}
 ],[]);
 const result=await respond(actor,randomUUID(),'Como calibrar a ZD230?',[],model,async(_actor,q)=>{queries.push(q);return queries.length===1?[source]:[extra];},{verifyEvidence:true});
 assert.equal(result.metrics?.recoverySearches,1);assert.equal(result.metrics?.literalFallbacks,0);
 assert.match(result.answer,/painel/);assert.equal(result.sources[0]?.ordinal,1);
});
