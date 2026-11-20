import {test} from 'node:test';
import assert from 'node:assert/strict';
import {relaxedLexicalQuery,safeRetrievedSources,type Source} from './retrieval.js';

test('natural Portuguese questions retain meaningful search terms',()=>{
 assert.equal(relaxedLexicalQuery('Como posso configurar o DNS no Linux?'),'configurar | dns | linux');
 assert.equal(relaxedLexicalQuery('Qual o procedimento no laboratório isolado?'),'procedimento | laboratório | isolado');
 assert.equal(relaxedLexicalQuery('DNS DNS dns'),'dns');
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
