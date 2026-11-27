import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CANDIDATE_SEMANTIC_MINIMUM,DEFAULT_RERANK_POLICY,relaxedLexicalQuery,safeRetrievedSources,searchKnowledge,expandCandidateContext,type Source} from './retrieval.js';

test('natural Portuguese questions retain meaningful search terms',()=>{
 assert.equal(relaxedLexicalQuery('Como posso configurar o DNS no Linux?'),'configurar | dns | linux');
 assert.equal(relaxedLexicalQuery('Qual o procedimento no laboratório isolado?'),'procedimento | laboratório | isolado');
 assert.equal(relaxedLexicalQuery('DNS DNS dns'),'dns');
});
test('calibrated defaults preserve the selected synthetic pilot policy',()=>{
 assert.equal(DEFAULT_CANDIDATE_SEMANTIC_MINIMUM,0.4);
 assert.deepEqual(DEFAULT_RERANK_POLICY,{semanticMinimum:0.5,diversityPenalty:0.18,lexicalMinimum:0});
});
test('tsquery operators from untrusted input are never forwarded',()=>{
 const cleaned=relaxedLexicalQuery("DNS | !(&:'bad') <-> VPN");
 assert.equal(cleaned,'dns | bad | vpn');
 assert.doesNotMatch(cleaned,/[&!:'()<>]/);
 assert.equal(relaxedLexicalQuery('Como eu posso?'),'');
});

test('RAG rejects legacy sources when the title contains a credential',()=>{
 const source:Source={documentId:'document',versionId:'version',ordinal:0,versionNumber:1,
   title:'VPN password=Senha#Segura2026!',content:'Procedimento sintético sem segredo no corpo',score:0.9};
 assert.deepEqual(safeRetrievedSources([source],5),[]);
 assert.equal(safeRetrievedSources([{...source,title:'VPN'}],5).length,1);
});

test('search with credentials stops before database or embedding requests',async()=>{
 // This assertion is independent of PostgreSQL and the embedding provider:
 // an unsafe search must exit before consulting either service.
 const actor={id:'synthetic',role:'USER',auth_revision:0,must_change_password:false} as const;
 assert.deepEqual(await searchKnowledge(actor,
   'Verifique a VPN: password=Senha#Segura2026!'),[]);
 const longQuery='x'.repeat(540)+' api_key=abcdefghijklmnopqrstuvwxyz123456';
 assert.deepEqual(await searchKnowledge(actor,longQuery),[],
   'Checking only the first 500 chars would leak credentials after truncation');
});


test('neighbor expansion preserves independent candidate versions within the existing cap',()=>{
 const base:Source={documentId:'a',versionId:'a1',ordinal:1,versionNumber:1,title:'A',content:'Procedimento A',score:1};
 const other=(id:string):Source=>({...base,documentId:id,versionId:id+'1',ordinal:0,title:id});
 const ranked=[base,{...base,ordinal:2},other('b'),other('c'),other('d')];
 const adjacent=[{...base,ordinal:0},{...base,ordinal:2}];
 const result=expandCandidateContext(ranked,adjacent,5);
 assert.deepEqual(new Set(result.map(s=>s.versionId)),new Set(['a1','b1','c1','d1']));
 assert.equal(result.length,5);assert.ok(result.some(s=>s.versionId==='a1'&&s.ordinal===0));
});
