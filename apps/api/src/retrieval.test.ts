import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeRetrievedSources,type Source} from './retrieval.js';

const make=(ordinal:number,content:string):Source=>({
 documentId:'00000000-0000-0000-0000-000000000001',
 versionId:'00000000-0000-0000-0000-000000000002',
 versionNumber:1,title:'Teste de conhecimento',ordinal,content,score:1
});
test('never forward legacy published chunks that contain recognizable secrets',()=>{
 const retrieved=[make(0,'api_key=abcdefghijklmnop'),make(1,'Guia de verificação de redes e servidores.'),make(2,'senha: Senha#Forte@2026!')];
 assert.deepEqual(safeRetrievedSources(retrieved,4).map(s=>s.ordinal),[1]);
 assert.deepEqual(safeRetrievedSources(retrieved,0),[]);
});
test('limit applies after filtering unsafe chunks',()=>{
 const retrieved=[make(0,'password=abcdefghijklmnop'),make(1,'Procedimento seguro A.'),make(2,'Procedimento seguro B.')];
 assert.deepEqual(safeRetrievedSources(retrieved,1).map(s=>s.ordinal),[1]);
});
