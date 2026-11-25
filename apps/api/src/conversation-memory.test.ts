import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildConversationMemory,memoryMessage} from './conversation-memory.js';

test('older user facts are available beyond eight recent messages',()=>{
 const history=[
  {role:'user' as const,content:'Estou trabalhando com a impressora Zebra ZD230.'},
  {role:'assistant' as const,content:'Qual problema está ocorrendo na Zebra?'},
  {role:'user' as const,content:'As etiquetas estavam desalinhadas.'},
  {role:'assistant' as const,content:'Verifique a calibração seguindo o procedimento publicado.'},
  ...Array.from({length:10},(_,i)=>({
   role:(i%2===0?'user':'assistant') as 'user'|'assistant',
   content:'Mensagem recente e contexto '+i
  }))
 ];
 const memory=buildConversationMemory(history);
 assert.ok(memory);
 assert.ok(memory.userFacts.some(t=>t.includes('Zebra ZD230')));
 assert.ok(memory.userFacts.some(t=>t.includes('etiquetas')));
 assert.match(memoryMessage(memory),/dados não verificados/i);
 assert.equal(buildConversationMemory(history.slice(-8)),null);
});
test('structured memory is bounded and excludes credential assignments',()=>{
 const history=[
  {role:'user' as const,content:'password=Senha#Segura2026!'},
  ...Array.from({length:80},(_,i)=>({
   role:(i%2===0?'user':'assistant') as 'user'|'assistant',
   content:'Informação sintética sobre equipamento '+i+' que precisa ser acompanhada.'
  }))
 ];
 const memory=buildConversationMemory(history,8,1100);
 assert.ok(memory);
 assert.ok(JSON.stringify(memory).length<1500);
 assert.equal(JSON.stringify(memory).includes('Senha#Segura2026!'),false);
 assert.equal(memory.truncated,true);
});
test('historical assistant statements remain unverified conversational data',()=>{
 const history=[
  {role:'assistant' as const,content:'Uma hipótese anterior era verificar a rede.'},
  ...Array.from({length:10},(_,i)=>({role:'user' as const,content:'Contexto posterior '+i}))
 ];
 const memory=buildConversationMemory(history);
 assert.ok(memory);
 assert.ok(memory.previousGuidance.some(x=>x.includes('hipótese')));
 assert.match(memoryMessage(memory),/Reconsulte o RAG/i);
});
