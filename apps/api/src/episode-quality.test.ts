import {test} from 'node:test';
import assert from 'node:assert/strict';
import {completeProcedureChecks,episodeQuality,retrievalMetrics} from './episode-quality.js';
test('retrieval metrics deduplicate document versions',()=>{
 assert.deepEqual(retrievalMetrics(['a','b'],['x','a','a']),{recall:0.5,precision:0.5,mrr:0.5});
});
test('quality flags are observable proxies, not semantic verdicts',()=>{
 const text='Encontrei um procedimento para configurar o telefone.';
 const q=episodeQuality(text,text,[text]);
 assert.equal(q.literalOverlap,1);assert.equal(q.repeatedLines,1);assert.equal(q.boilerplate,true);
});

test('a raw fallback with a full-document citation does not establish complete guidance',()=>{
 const source=[{ordinal:-1}];
 assert.deepEqual(completeProcedureChecks('Não consegui concluir a análise automática. Segue somente um trecho autorizado da documentação, sem confirmar sua aplicação ou a completude do procedimento.',source,'complete'),['procedure_completeness_not_confirmed']);
 assert.deepEqual(completeProcedureChecks('Não consigo confirmar o procedimento completo com as informações disponíveis.',source,'complete'),['procedure_completeness_not_confirmed']);
 assert.deepEqual(completeProcedureChecks('O trecho disponível contém dados de acesso, mas não descreve as etapas do procedimento solicitado.',source,'complete'),['procedure_completeness_not_confirmed']);
 assert.deepEqual(completeProcedureChecks('1. Abra o painel.\n2. Consulte o inventário. [1]',source,'complete'),[]);
 assert.deepEqual(completeProcedureChecks('Abra o painel.',[{ordinal:0}],'guided'),['missing_complete_document','wrong_support_mode']);
});

test('a complete citation and mode are insufficient without positive coverage review',()=>{
 assert.deepEqual(completeProcedureChecks('Abra o painel.',[{ordinal:-1}],'complete',false),['missing_verified_complete_coverage']);
 assert.deepEqual(completeProcedureChecks('Abra o painel. Confirme a emissão.',[{ordinal:-1}],'complete',true),[]);
});

test('quality flags repeated questions independently of line breaks or citations',()=>{
 const q=episodeQuality('Confira o painel. Apareceu a tela? [1]','Confira o painel.',['Apareceu a tela?']);
 assert.equal(q.repeatedQuestions,1);
 assert.equal(episodeQuality('Apareceu outra tela?','Confira o painel.',['Apareceu a tela?']).repeatedQuestions,0);
});
