import {test} from 'node:test';
import assert from 'node:assert/strict';
import {externalAIApproved,shouldForceKnowledgeLookup,groundedReply} from './llm-policy.js';

test('an API key never authorizes external transmission by itself',()=>{
 assert.equal(externalAIApproved(undefined,'true'),false);
 assert.equal(externalAIApproved('test-key',undefined),false);
 assert.equal(externalAIApproved('test-key','false'),false);
 assert.equal(externalAIApproved('test-key','TRUE'),false);
 assert.equal(externalAIApproved('test-key','true'),true);
});
test('technical questions require a knowledge lookup; greetings and write proposals do not',()=>{
 assert.equal(shouldForceKnowledgeLookup('Como configurar uma VLAN?'),true);
 assert.equal(shouldForceKnowledgeLookup('Qual o procedimento de backup?'),true);
 assert.equal(shouldForceKnowledgeLookup('Oi, bom dia'),false);
 assert.equal(shouldForceKnowledgeLookup('Bom dia, qual é o procedimento de backup?'),true);
 assert.equal(shouldForceKnowledgeLookup('Oi! Como reiniciar o serviço VPN?'),true);
 assert.equal(shouldForceKnowledgeLookup('Obrigado, explique a política de acesso'),true);
 assert.equal(shouldForceKnowledgeLookup('Adicione este procedimento'),false);
});
test('unsourced technical explanations are always labeled non-validated',()=>{
 assert.match(groundedReply('Execute o passo X.',true,0),/não um procedimento interno validado/i);
 assert.equal(groundedReply('Executar procedimento.',true,1),'Executar procedimento.');
 assert.equal(groundedReply('Bom dia!',false,0),'Bom dia!');
});
