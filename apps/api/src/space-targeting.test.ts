import {test} from 'node:test';
import assert from 'node:assert/strict';
import {explicitlyTargetedSpace} from './space-targeting.js';

const spaces=[
 {id:'a',name:'TI'},
 {id:'b',name:'Operações'},
 {id:'c',name:'Financeiro'}
];
test('new article needs a unique destination if user has several writable spaces',()=>{
 assert.equal(explicitlyTargetedSpace('Crie um artigo sobre backup',[],spaces),null);
 assert.deepEqual(explicitlyTargetedSpace('Crie um artigo em Operacoes',[],spaces),spaces[1]);
 assert.deepEqual(explicitlyTargetedSpace('Registre na base TI o procedimento de backup',[],spaces),spaces[0]);
 assert.deepEqual(explicitlyTargetedSpace('Crie no financeiro',[],spaces),spaces[2]);
});
test('similar words and multiple space names must not silently select a destination',()=>{
 assert.equal(explicitlyTargetedSpace('Crie uma rotina a partir dos logs',[],spaces),null);
 assert.equal(explicitlyTargetedSpace('Compare TI e Financeiro e cadastre o artigo',[],spaces),null);
 assert.equal(explicitlyTargetedSpace('Crie artigo para operações de TI',[],spaces),null);
});
test('a specific earlier user mention may resolve an explicit follow-up',()=>{
 assert.deepEqual(explicitlyTargetedSpace('Crie o artigo nesse espaço',[
  {role:'user',content:'Quero trabalhar no espaço Operações'},
  {role:'assistant',content:'Posso ajudar.'}
 ],spaces),spaces[1]);
 assert.equal(explicitlyTargetedSpace('Crie o artigo',[
  {role:'user',content:'Quero trabalhar no espaço Operações'}
 ],spaces),null);
 assert.equal(explicitlyTargetedSpace('Crie o artigo nesse espaço',[
  {role:'user',content:'Compare Financeiro e Operações'}
 ],spaces),null);
});
test('only one writable space never requires a redundant clarification',()=>{
 assert.deepEqual(explicitlyTargetedSpace('Crie um artigo',[],spaces.slice(0,1)),spaces[0]);
 assert.equal(explicitlyTargetedSpace('Crie um artigo',[],[]),null);
});
