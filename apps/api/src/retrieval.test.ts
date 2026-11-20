import {test} from 'node:test';
import assert from 'node:assert/strict';
import {relaxedLexicalQuery} from './retrieval.js';

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
