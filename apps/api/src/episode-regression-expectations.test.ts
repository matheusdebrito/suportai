import {test} from 'node:test';
import assert from 'node:assert/strict';
import {supplementalEpisodeChecks} from './episode-regression-expectations.js';
test('supplemental fixture expectations expose an invented concept and repeated completed step',()=>{
 assert.deepEqual(supplementalEpisodeChecks('printer-negative-progress',3,'Feche a tampa. Pode ser o sensor.','guided'),
  ['undocumented_concept_1','repeated_explicitly_completed_instruction']);
 assert.deepEqual(supplementalEpisodeChecks('printer-negative-progress',3,'Com a tampa fechada, pressione Feed. A etiqueta avançou?','guided'),[]);
});
test('a cited but incomplete response cannot satisfy material marker checks',()=>{
 assert.ok(supplementalEpisodeChecks('focused-scanner-and-mode',4,'Abra o aplicativo de digitalização. [1]','complete').length>0);
 assert.deepEqual(supplementalEpisodeChecks('focused-scanner-and-mode',4,'Abra o aplicativo. Escolha Digitalizar. Resolução: 300 DPI. Formato: PDF. [1]','complete'),[]);
});
