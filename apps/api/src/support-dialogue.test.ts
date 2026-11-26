import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isFocusedKnowledgeQuestion,supportPreference,supportContext,safeProgressQuestion,setupObjective,lastProgressQuestion,SUPPORT_POLICY} from './support-dialogue.js';
import {routeInvestigation,updateInvestigationFromMessage} from './investigation-dialogue.js';
test('guided setup and full procedure preference remain distinct',()=>{
 assert.equal(supportPreference('Preciso configurar um telefone',[]),'guided');
 assert.equal(supportPreference('Me passe o procedimento completo',[]),'complete');
 assert.equal(supportPreference('Sim. Pode me passar o passo a psso completo',[]),'complete');
 assert.equal(supportPreference('Sim. Me dê o passo a passo completo',[]),'complete');
 assert.equal(supportPreference('Consegui',[{role:'user',content:'Preciso instalar uma impressora'}]),'guided');
 assert.equal(supportPreference('Me envie todos os passos',[{role:'user',content:'Preciso instalar uma impressora'}]),'complete');
 assert.equal(setupObjective('Preciso configurar um telefone fixo'),'telefone fixo');
});
test('focused knowledge questions request a concise human answer instead of an article recap',()=>{
 assert.equal(isFocusedKnowledgeQuestion('Qual a senha para acessar a interface do telefone?'),true);
 assert.equal(isFocusedKnowledgeQuestion('Em qual menu eu configuro o SIP?'),true);
 assert.equal(isFocusedKnowledgeQuestion('Não entendi a parte da senha'),true);
 assert.equal(isFocusedKnowledgeQuestion('A senha pode ser admin'),true);
 assert.equal(isFocusedKnowledgeQuestion('Preciso configurar um telefone'),false);
 assert.match(SUPPORT_POLICY,/matéria-prima factual, nunca um texto pronto/i);
 assert.match(SUPPORT_POLICY,/uma ou duas frases curtas/i);
 assert.match(SUPPORT_POLICY,/sem recapitular o procedimento/i);
});
test('progress questions ask observations, not secrets or unverified operational actions',()=>{
 assert.ok(safeProgressQuestion('Conseguiu identificar o endereço?'));
 assert.ok(safeProgressQuestion('Apareceu a tela de login?'));
 assert.ok(safeProgressQuestion('O menu é diferente?'));
 assert.equal(safeProgressQuestion('Qual é a senha?'),false);
 assert.equal(safeProgressQuestion('Você já desative o antivírus?'),false);
 assert.equal(safeProgressQuestion('Conseguiu acessar https://invented.example.test?'),false);
});
test('setup objective and short user observations can persist in existing investigation state',()=>{
 const route=routeInvestigation('Preciso configurar um telefone',[],null);
 assert.deepEqual(route,{kind:'new',topic:'telefone'});
 const subjects=[{id:'i',topic:'telefone'}];
 assert.deepEqual(routeInvestigation('Consegui',subjects,'i','Conseguiu identificar o endereço?'),{kind:'existing',id:'i'});
 const draft=updateInvestigationFromMessage('telefone','Preciso configurar um telefone');
 const updated=updateInvestigationFromMessage('telefone','Consegui',draft,'Conseguiu identificar o endereço?');
 assert.deepEqual(updated.reportedFacts,['Preciso configurar um telefone','Consegui']);
 assert.deepEqual(routeInvestigation('Mudando de assunto: impressora',subjects,'i','Conseguiu identificar o endereço?'),{kind:'new',topic:'impressora'});
 const context=supportContext('Consegui',[{role:'user',content:'Preciso configurar um telefone'},{role:'assistant',content:'Conseguiu identificar o endereço?'}],draft);
 assert.match(context,/lastQuestion":"Conseguiu identificar o endereço\?/);
});

test('mode changes retain active subject and inline progress questions remain detectable',()=>{
 assert.equal(lastProgressQuestion('Abra a interface web. [1] Apareceu a tela de login?'),'Apareceu a tela de login?');
 assert.deepEqual(routeInvestigation('Me passe o procedimento completo',[{id:'i',topic:'telefone'}],'i'),{kind:'existing',id:'i'});
 assert.equal(supportPreference('Mudando de assunto: qual o DNS?',[{role:'user',content:'Preciso configurar um telefone'}]),'adaptive');
});
