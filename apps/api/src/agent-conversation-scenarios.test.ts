import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type OpenAI from 'openai';
import type {Actor} from './security.js';
import type {Source} from './retrieval.js';
import {respond} from './agent.js';

/**
 * One hundred deterministic harness regressions with Brazilian Portuguese
 * utterances. These verify tool routing, guardrails and state propagation;
 * they DO NOT claim that a real model understands all 100 utterances.
 */
const actor:Actor={id:randomUUID(),role:'USER',auth_revision:1,must_change_password:false};
const topics=[
 {name:'Zebra ZD230',search:'ZD230 alinhamento etiquetas'},
 {name:'VPN',search:'VPN acesso remoto'},
 {name:'DNS',search:'DNS resolução nomes'},
 {name:'notebook',search:'notebook inicialização'},
 {name:'Wi-Fi',search:'Wi-Fi conexão instável'}
];
const informal=[
 (topic:string)=>'Mano, o '+topic+' tá esquisito, tem algum procedimento?',
 (topic:string)=>'Cara, deu ruim no '+topic+'. Como resolvo?',
 (topic:string)=>'Opa, preciso de uma força com '+topic+'.',
 (topic:string)=>'Tô com um pepino no '+topic+', me dá um norte?',
 (topic:string)=>'Ei, o '+topic+' não tá legal. Consegue olhar na base?'
];
const formal=[
 (topic:string)=>'Qual é o procedimento documentado para '+topic+'?',
 (topic:string)=>'Por favor, consulte os artigos relacionados a '+topic+'.',
 (topic:string)=>'Precisamos verificar a documentação sobre '+topic+'.',
 (topic:string)=>'Consegue orientar o diagnóstico de '+topic+'?',
 (topic:string)=>'Gostaria de localizar o manual de '+topic+'.'
];
const ambiguous=[
 'Cara, isso não abre de jeito nenhum.',
 'Tá dando um erro aqui, pode ajudar?',
 'Deu ruim de novo, sabe o que pode ser?',
 'Opa, não funcionou. E agora?',
 'Mano, parou tudo. Que faço?'
];
const contexts=[
 'Estou no escritório usando um computador.',
 'Ontem tive outro incidente na rede.',
 'Um colaborador relatou um problema sem informar detalhes.',
 'O equipamento apresentou falhas intermitentes.',
 'O sistema exibiu uma mensagem que ainda não consegui ler.'
];
const followups=[
 (name:string)=>'É o '+name+', e agora?',
 (_name:string)=>'Isso, pode pesquisar.',
 (_name:string)=>'Pode olhar na documentação?',
 (_name:string)=>'Sim, é esse problema.',
 (_name:string)=>'Boa, continua a investigação.'
];
type Scenario={id:string;message:string;history:{role:'user'|'assistant';content:string}[];
 expected:'search'|'clarify';query:string};
const scenarios:Scenario[]=[];
for(let i=0;i<topics.length;i++){
 const topic=topics[i];
 for(let j=0;j<5;j++){
  scenarios.push({id:'informal-'+i+'-'+j,message:informal[j](topic.name),
   history:[],expected:'search',query:topic.search});
  scenarios.push({id:'formal-'+i+'-'+j,message:formal[j](topic.name),
   history:[],expected:'search',query:topic.search});
  scenarios.push({id:'ambiguous-'+i+'-'+j,message:ambiguous[j],
   history:[{role:'user',content:contexts[i]},{role:'assistant',content:'Qual equipamento ou sistema foi afetado?'}],
   expected:'clarify',query:''});
  scenarios.push({id:'followup-'+i+'-'+j,message:followups[j](topic.name),
   history:[{role:'user',content:'Estou investigando '+topic.name+' no trabalho.'},
    {role:'assistant',content:'Consigo consultar os procedimentos disponíveis.'}],
   expected:'search',query:topic.search});
 }
}
assert.equal(scenarios.length,100);
const source:Source={documentId:randomUUID(),versionId:randomUUID(),versionNumber:1,
 ordinal:0,title:'Manual fictício de TI',
 content:'O manual de TI contém um procedimento sintético para verificar o equipamento.',score:0.9};
for(const scenario of scenarios){
 test('Harness PT-BR simulated '+scenario.id,async()=>{
  const requests:any[]=[];
  const calls:any[]=scenario.expected==='clarify'
   ?[{role:'assistant',content:null,tool_calls:[{
      id:'ask',type:'function',function:{name:'ask_clarification',
       arguments:JSON.stringify({question:'Qual é o sistema ou equipamento afetado?'})}
     }]}]
   :[
    {role:'assistant',content:null,tool_calls:[{
      id:'search',type:'function',function:{name:'search_knowledge',
       arguments:JSON.stringify({query:scenario.query})}
     }]},
    {role:'assistant',content:'Encontrei um manual de TI que descreve o procedimento de verificação.'}
   ];
  const model={chat:{completions:{create:async(request:any)=>{
   requests.push(request);
   const response=calls.shift();
   if(!response)throw new Error('Modelo de teste sem resposta');
   return {choices:[{message:response,finish_reason:'stop'}]};
  }}}} as unknown as OpenAI;
  const queries:string[]=[];
  const output=await respond(actor,randomUUID(),scenario.message,scenario.history,
   model,async(_actor,text)=>{queries.push(text);return [source];});
  assert.equal(requests[0].tool_choice,'required',scenario.id);
  assert.deepEqual(requests[0].tools.map((t:any)=>t.function.name),
   ['search_knowledge','ask_clarification','respond_social','get_knowledge_document','list_document_versions','list_writable_spaces','prepare_article'],scenario.id);
  for(const turn of scenario.history)
   assert.ok(requests[0].messages.some((msg:any)=>msg.content===turn.content),scenario.id);
  if(scenario.expected==='clarify'){
   assert.deepEqual(queries,[],scenario.id);
   assert.match(output.answer,/Qual é o sistema ou equipamento/i,scenario.id);
   assert.equal(output.metrics?.stopReason,'clarified',scenario.id);
   assert.equal(output.metrics?.steps,1,scenario.id);
  }else{
   assert.deepEqual(queries,[scenario.query],scenario.id);
   assert.equal(output.metrics?.stopReason,'answered',scenario.id);
   assert.equal(output.metrics?.steps,2,scenario.id);
   assert.equal(output.sources[0]?.versionId,source.versionId,scenario.id);
  }
  assert.deepEqual(output.pendingActions,[],scenario.id);
 });
}
