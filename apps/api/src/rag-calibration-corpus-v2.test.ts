import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildCalibrationCorpusV2,CALIBRATION_CATEGORIES} from './rag-calibration-corpus-v2.js';

test('expanded RAG corpus freezes 100 positive labels with independent 60/40 splits',()=>{
 const corpus=buildCalibrationCorpusV2(),{cases,documents}=corpus.positive;
 assert.equal(corpus.frozen,true);assert.equal(corpus.review.origin,'ai-technical-review');assert.equal(corpus.review.humanReview,'pending');
 assert.equal(cases.length,100);assert.equal(cases.filter(c=>c.split==='pilot').length,60);assert.equal(cases.filter(c=>c.split==='holdout').length,40);
 assert.deepEqual(Object.fromEntries(Object.keys(CALIBRATION_CATEGORIES).map(category=>[category,cases.filter(c=>c.category===category).length])),CALIBRATION_CATEGORIES);
 assert.equal(new Set(cases.map(c=>c.id)).size,100);assert.equal(new Set(documents.map(d=>d.id)).size,documents.length);
 const pilotFamilies=new Set(cases.filter(c=>c.split==='pilot').map(c=>c.family));
 assert.ok(cases.filter(c=>c.split==='holdout').every(c=>!pilotFamilies.has(c.family)));
 const pilotCandidates=new Set(cases.filter(c=>c.split==='pilot').flatMap(c=>c.candidateDocumentIds));
 assert.ok(cases.filter(c=>c.split==='holdout').flatMap(c=>c.candidateDocumentIds).every(id=>!pilotCandidates.has(id)));
 const documentIds=new Set(documents.map(d=>d.id));
 for(const item of cases){
  assert.ok(item.candidateDocumentIds.length>=3);assert.ok(item.expectedRelevantDocumentIds.length>=1);
  assert.ok(item.candidateDocumentIds.every(id=>documentIds.has(id)));assert.ok(item.expectedRelevantDocumentIds.every(id=>item.candidateDocumentIds.includes(id)));
  assert.ok(item.expectedRelevantChunks.length>=item.expectedRelevantDocumentIds.length);assert.ok(item.labelRationale.length>80);
 }
 const domains=new Set(cases.map(c=>c.domain));
 for(const domain of ['telefonia','impressoras','computadores','redes','wifi','dns','dhcp','scanners','ris','erp','pacs','instalacoes','permissoes','acessos'])assert.ok(domains.has(domain),domain);
});

test('security and abstention suite stays separate from positive retrieval metrics',()=>{
 const corpus=buildCalibrationCorpusV2(),{cases,documents}=corpus.security;
 assert.equal(cases.length,20);assert.equal(cases.every(c=>c.expectedRelevantDocumentIds.length===0&&c.expectedRelevantChunks.length===0),true);
 assert.ok(cases.every(c=>c.category==='security'&&c.domain==='security'&&c.split==='security'));
 assert.equal(new Set(cases.map(c=>c.threat)).size,10);
 assert.ok(cases.every(c=>c.risk==='high'||c.risk==='critical'));
 assert.ok(documents.some(d=>d.access==='restricted'));assert.ok(documents.some(d=>d.status==='revoked'));
 for(const threat of ['unauthorized_document','restricted_content','revoked_document','prompt_injection','personal_credentials','tokens_and_secrets','no_relevant_knowledge','incompatible_sources','unresolved_conflict','invented_procedure'])assert.equal(cases.filter(c=>c.threat===threat).length,2,threat);
});
