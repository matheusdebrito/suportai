import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unsupportedNetworkLiterals} from './answer-evidence.js';

test('only an exact IPv4 address from an authorized excerpt supports an answer',()=>{
 const source=[{content:'Laboratório: DNS 192.0.2.53. Gateway 198.51.100.12.'}];
 assert.deepEqual(unsupportedNetworkLiterals('Use 192.0.2.53.',source),[]);
 assert.deepEqual(unsupportedNetworkLiterals('Use 192.0.2.5.',source),['192.0.2.5']);
 assert.deepEqual(unsupportedNetworkLiterals('Use 198.51.100.1.',source),['198.51.100.1']);
 assert.deepEqual(unsupportedNetworkLiterals('Use 192.0.2.53 e 192.0.2.54.',source),['192.0.2.54']);
});
test('a longer URL is not supported by a shorter URL in a document',()=>{
 const source=[{content:'Instruções fictícias: https://intranet.example.test/manual.'}];
 assert.deepEqual(unsupportedNetworkLiterals('Acesse https://intranet.example.test/manual',source),[]);
 assert.deepEqual(unsupportedNetworkLiterals('Acesse https://intranet.example.test/manual/segredo',source),
   ['https://intranet.example.test/manual/segredo']);
 assert.deepEqual(unsupportedNetworkLiterals('Acesse https://intranet.example.test',source),
   ['https://intranet.example.test']);
});
test('punctuation and case around exact citations are normalized',()=>{
 const source=[{content:'Acesse HTTPS://EXAMPLE.TEST/KB; ou 203.0.113.5.'}];
 assert.deepEqual(unsupportedNetworkLiterals('Veja (https://example.test/kb), IP 203.0.113.5!',source),[]);
 assert.deepEqual(unsupportedNetworkLiterals('Sem endereço aqui',source),[]);
});
