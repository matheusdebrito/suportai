# Melhorias propostas para o agente SuportAI

## Objetivo

Este documento consolida a análise da janela de contexto, do prompt de sistema, do RAG e do harness de avaliação. O foco é melhorar a continuidade conversacional e a naturalidade das respostas sem reduzir os controles de autorização, evidência e segurança já existentes.

## Diagnóstico geral

A recuperação de conhecimento e a autorização estão entre as partes mais maduras do sistema. As falhas observadas no atendimento de configuração de telefone foram causadas principalmente por três fatores:

1. perda da investigação ativa em mensagens curtas de seguimento;
2. verificação semântica que trata introduções inofensivas como conteúdo factual omitido;
3. harness concentrado em contratos isolados, sem reproduzir episódios conversacionais completos.

O RAG localizou a fonte correta nos exemplos analisados. Portanto, aumentar o número de documentos recuperados ou trocar o modelo de embeddings não deve ser a primeira intervenção.

## P0 — Continuidade da janela de contexto

### Manter a investigação ativa

Atualmente, o assunto ativo é derivado apenas da mensagem imediatamente anterior. Se ela tiver `investigation_id = null`, o contexto anterior deixa de ser selecionado nos turnos seguintes.

Melhorias:

- selecionar a investigação não nula mais recente, salvo quando houver troca explícita de assunto;
- reconhecer como continuação frases como "não entendi a parte da senha", "isso pode ser admin?", "e depois?", "me passe tudo" e confirmações curtas;
- preservar a investigação ativa quando uma mensagem apenas altera o modo de atendimento;
- criar testes de regressão no fluxo HTTP e no banco, não somente na função do agente.

### Substituir a concatenação bruta da consulta contextual

A busca contextual atual concatena o assunto, até quatro mensagens do usuário e a mensagem atual, limitando o resultado aos últimos 500 caracteres. Isso pode misturar intenções antigas, remover o assunto original e transportar palavras sensíveis para uma busca posterior.

Construir a consulta com campos estruturados:

```text
assunto ativo + equipamento + ambiente + intenção atual + sintoma atual
```

Confirmações, agradecimentos e mensagens antigas não devem ser copiadas literalmente para a consulta. Termos sensíveis de um turno anterior não devem bloquear a recuperação de um procedimento solicitado no turno atual.

### Persistir o modo de atendimento

O modo `guided`, `complete` ou `adaptive` é inferido novamente por expressões regulares a cada turno. Persistir essa preferência no estado da investigação e alterá-la somente quando o usuário pedir explicitamente reduz ambiguidades e dependência de variações linguísticas.

## P1 — Prompt e síntese

### Organizar o prompt por responsabilidade

Separar o prompt em blocos curtos e explícitos:

1. identidade e tom;
2. política de autorização e evidência;
3. estado da investigação;
4. modo de atendimento atual;
5. contrato da resposta.

O contrato deve manter as regras já introduzidas:

- conhecimento recuperado é matéria-prima factual, não texto pronto;
- responder com redação nova e natural;
- preservar literalmente valores técnicos, campos e caminhos de menu;
- não reproduzir títulos, preâmbulos, citações ou elementos da interface;
- responder perguntas pontuais em uma ou duas frases;
- entregar o procedimento completo quando solicitado explicitamente.

### Distinguir credenciais pessoais de senhas operacionais

O prompt deve diferenciar claramente:

- credenciais pessoais, tokens e chaves de API, que nunca devem ser solicitados ou expostos;
- senhas padrão de equipamentos publicadas como conhecimento operacional, que podem ser informadas quando necessárias e sustentadas literalmente pela fonte.

### Evitar regras concorrentes

Instruções adicionadas durante recuperação e reescrita devem usar o mesmo contrato de resposta. Nenhuma etapa de recuperação deve reintroduzir expressões como "encontrei um procedimento" ou incentivar a reprodução integral do artigo fora do modo completo.

## P1 — Verificação e grounding

### Separar unidade não factual de afirmação sem suporte

O verificador atualmente usa `omitted` tanto para introduções e títulos quanto para afirmações não sustentadas. Qualquer unidade omitida acrescenta o aviso de que nem todos os detalhes foram confirmados.

Criar categorias distintas:

- `nonclaim`: título, transição, saudação ou introdução sem afirmação factual;
- `unsupported`: afirmação factual sem evidência suficiente;
- `supported`: afirmação sustentada;
- `question`: pergunta neutra de progresso.

Somente `unsupported` deve produzir aviso de resposta parcial.

### Preservar dependências entre passos

Quando um passo depende de um pré-requisito removido, o restante não deve ser apresentado isoladamente. O verificador deve validar grupos procedurais ou retornar uma rejeição completa quando a remoção alterar a ordem ou o sentido.

### Medir falsos bloqueios

Registrar separadamente:

- respostas incorretas aceitas;
- respostas corretas bloqueadas;
- respostas naturais degradadas para fallback;
- unidades não factuais removidas;
- respostas que receberam aviso parcial sem necessidade.

### Tornar o contrato do verificador estrito com Structured Outputs

O verificador atualmente solicita um objeto JSON, mas um JSON sintaticamente válido ainda pode omitir unidades, repetir índices ou devolver campos incompatíveis com o contrato. Isso produz `claim_shape` mesmo quando a resposta textual pode estar correta. Trocar o formato livre por Structured Outputs com JSON Schema estrito, sem transformar o modelo em autoridade sobre acesso ou publicação.

Passos de implementação:

1. definir um schema versionado para o resultado do verificador, com `additionalProperties: false` em todos os objetos;
2. restringir `verdict` aos valores `supported`, `unsupported`, `uncertain` e `conflict`;
3. quando o veredito for `supported`, exigir `claims` como array de objetos com `unit`, `kind` e `refs`, usando enums fechados e tipos explícitos;
4. restringir cada referência a `evidence` e `quote`, mantendo os limites de quantidade e tamanho também na validação do backend;
5. enviar o schema com modo estrito pela API do provedor, em vez de depender apenas de `response_format: {type: "json_object"}`;
6. manter a validação local após a resposta: conferir intervalo e unicidade de `unit`, existência literal de `quote`, autorização, versão, escopo e dependências procedurais;
7. classificar separadamente recusa do modelo, interrupção, incompatibilidade do provedor, schema inválido e falha de transporte, sem registrar resposta, prompt ou trechos;
8. adicionar testes simulados para campos extras, enum inválido, unidade duplicada, referência inexistente, array incompleto e resposta recusada;
9. executar o corpus episódico com modelo real e comparar `claim_shape`, falsos bloqueios, latência e tokens com o baseline anterior;
10. manter compatibilidade explícita por modelo: se um modelo configurado não suportar Structured Outputs estrito, falhar de forma controlada e acionar o fallback, sem reduzir silenciosamente o contrato para JSON livre.

Critérios de aceitação:

- nenhuma resposta fora do schema chega à lógica de grounding como se fosse válida;
- zero `claim_shape` causado apenas por JSON malformado ou campos livres nos cenários sintéticos revisados;
- uma resposta estruturalmente válida ainda é rejeitada quando a evidência, autorização, versão ou dependência procedural estiver incorreta;
- métricas distinguem erro estrutural do provedor de afirmação semanticamente não suportada;
- nenhum conteúdo sensível é incluído em logs de erro ou telemetria.

### Preservar fallback determinístico quando o provedor falhar

Structured Outputs reduz variações de formato, mas não elimina timeout, indisponibilidade, recusa, interrupção ou respostas semanticamente insuficientes. O fallback deve continuar independente do modelo e devolver somente conteúdo vigente, publicado e autorizado.

Passos de implementação:

1. centralizar os motivos que podem acionar fallback: `provider_error`, `invalid_json`, erro de schema, `model_interrupted`, `model_uncertain`, rejeição após a tentativa limitada de reescrita e orçamento esgotado;
2. exigir uma única versão vigente e autorizada, sem combinar documentos, versões históricas ou fontes conflitantes;
3. preservar as verificações contra prompt injection, segredos de infraestrutura e trechos revogados antes de montar a resposta;
4. usar correspondência lexical conservadora com normalização de acentos e flexões comuns do português, sem aceitar uma fonte apenas por similaridade semântica;
5. reconhecer listas numeradas, bullets e task lists Markdown, inclusive marcadores `- [ ]` armazenados na mesma linha, preservando a ordem e os valores técnicos;
6. manter respostas específicas por modo: próxima etapa curta no modo `guided`, documento completo somente no modo `complete` e trecho atribuído no modo `adaptive`;
7. não remover pré-requisitos nem apresentar o restante de um procedimento quando a fonte estiver truncada;
8. registrar somente código do motivo, contagens e uso do fallback, sem registrar pergunta, resposta ou conteúdo recuperado;
9. adicionar regressões com variações linguísticas como `habilito`/`habilitar`, termos de domínio como `guia` e uma fonte próxima porém incompatível, como RIS versus ERP;
10. testar o caminho completo em que a recuperação encontra a fonte, o verificador falha e o fallback ainda entrega uma orientação segura e citada.

Critérios de aceitação:

- falha do provedor não resulta em orientação inventada nem em fonte não autorizada;
- quando existir uma única fonte aplicável e segura, o usuário recebe conteúdo útil em vez de uma mensagem genérica;
- uma mudança de sistema, equipamento ou ambiente continua bloqueando uma fonte apenas lexicalmente parecida;
- o fallback nunca mistura versões, não expõe segredos e mantém valores e ordem do procedimento;
- a telemetria permite medir quantas respostas dependeram do fallback e por qual classe de falha.

## P1 — Seleção semântica de conhecimento pelo LLM

O RAG é responsável por recuperar candidatos publicados e autorizados, não por decidir sozinho qual fonte atende ao usuário. A escolha deve usar o objetivo, contexto conversacional, ação solicitada, aplicabilidade e suficiência do conteúdo, evitando regras específicas para cada equipamento, verbo ou procedimento.

- O modelo pode buscar, comparar candidatos, selecionar versões aplicáveis por `select_knowledge`, abrir o documento escolhido, responder com evidência parcial ou fazer uma pergunta de esclarecimento quando a dúvida impedir uma decisão segura.
- A ferramenta de seleção aceita somente IDs vigentes obtidos no turno, não cria permissões e não executa mutações. A seleção pode ser invalidada quando novas alternativas forem recuperadas.
- Em modo completo, não abrir automaticamente o primeiro resultado quando houver documentos concorrentes. Usar a decisão semântica para escolher a versão, com revalidação de acesso.
- Manter o verificador independente com as fontes selecionadas e alternativas disponíveis; uma citação literal não basta quando o contexto ou a ação divergem.
- Aceitar perguntas neutras sem citações quando não houver orientação factual, incluindo durante a recuperação após rejeição do verificador. Não solicitar credenciais nem repetir perguntas desnecessárias.
- Se a informação for parcial, apresentar somente o que estiver sustentado e explicitar a lacuna. Não inventar menus ou etapas; não tratar dados de acesso como procedimento completo.
- Fallback determinístico continua sendo recuperação conservadora, sem confiar na seleção do modelo para contornar autorização, conflito ou grounding.
- Reutilizar o loop e seus orçamentos de tempo, tokens, buscas e iterações. Registrar seleção, suficiência, rejeições, invalidações e esclarecimentos sem dados sensíveis.

Critérios de aceitação: escolher semanticamente entre conhecimentos concorrentes; distinguir sistemas e operações semelhantes; perguntar quando faltar contexto, sem forçar uma síntese; manter zero referências fora da autorização ou do conjunto recuperado; preservar os critérios anteriores de grounding e segurança. Validar com testes simulados e episódios reais complementares, sem modificar o baseline histórico.

## P2 — Recuperação RAG

### Chunking estrutural

O chunking atual usa blocos de 1.100 caracteres com sobreposição de 150. Substituir ou complementar esse mecanismo por divisão estrutural:

- preservar título e conteúdo da seção;
- manter listas numeradas completas;
- manter campos de configuração e respectivos valores no mesmo trecho;
- evitar separar condição, pré-requisito e ação;
- limitar o tamanho final depois de respeitar os limites estruturais.

### Expansão de trechos vizinhos

Quando um chunk intermediário for recuperado, incluir os chunks anterior e posterior do mesmo documento quando houver continuidade procedimental. A expansão deve continuar sujeita à autorização e ao limite total de contexto.

### Abrir o documento completo quando apropriado

Pedidos explícitos de "procedimento completo" devem favorecer a leitura da versão publicada completa, em vez de depender apenas dos chunks encontrados pela busca.

### Calibrar os limiares

Os limiares semânticos e lexicais atuais são valores conservadores definidos sobre corpus sintético. Medir recall, MRR e precisão com um corpus piloto revisado antes de alterá-los.

## P1 — Harness episódico

### Executar conversas completas

Criar um runner que envie turnos sequenciais pelo mesmo fluxo usado pela aplicação, persistindo mensagens, investigação, fontes e respostas reais entre os turnos.

Caso mínimo de regressão:

```text
Usuário: preciso configurar um telefone
Usuário: sim
Usuário: não entendi a parte da senha
Usuário: a senha pode ser admin
Usuário: me dê o passo a passo completo
```

O harness deve conferir:

- manutenção do mesmo assunto;
- avanço correto entre etapas;
- resposta direta sobre a senha;
- ausência de perguntas sobre contexto já informado;
- entrega completa no último turno;
- fontes e versões corretas em cada resposta.

### Avaliar naturalidade e utilidade

Adicionar critérios automáticos e revisão humana para:

- sobreposição literal com o artigo;
- presença de boilerplate;
- repetição de passos;
- resposta direta a perguntas pontuais;
- próxima etapa adequada;
- Markdown escapado e artefatos de interface;
- avisos de grounding desnecessários;
- clareza, concisão e tom humano.

### Testar recuperação e geração separadamente

Os cenários que injetam fontes diretamente medem síntese e verificação, mas não a recuperação. Manter relatórios separados para:

1. documento esperado recuperado;
2. ranking e cobertura dos chunks;
3. resposta gerada;
4. resultado do verificador;
5. fallback utilizado;
6. qualidade conversacional final.

### Corrigir metadados da avaliação

O relatório deve registrar a configuração realmente utilizada por `respond()`. Hoje a avaliação declara temperatura, `topP` e limite de tokens diferentes dos parâmetros efetivos do agente.

Também é necessário:

- criar e versionar um baseline reproduzível quando houver execução autorizada;
- atualizar a documentação, que ainda apresenta contagens antigas de cenários;
- manter resultados de modelo real separados dos testes com modelo simulado;
- impedir que uma melhoria de regex seja tratada como melhoria comprovada de compreensão.

## Ordem sugerida de implementação

1. corrigir seleção e persistência da investigação ativa;
2. criar o teste episódico do telefone pelo fluxo HTTP;
3. substituir a consulta contextual concatenada por uma consulta estruturada;
4. separar `nonclaim` de `unsupported` no verificador;
5. migrar o verificador para Structured Outputs com JSON Schema estrito;
6. consolidar e testar o fallback determinístico para falhas do provedor e do verificador;
7. alinhar o registro de configuração do avaliador com a execução real;
8. adicionar métricas de naturalidade, repetição e fallback;
9. implementar chunking estrutural e expansão de vizinhos;
10. executar avaliação autorizada com modelo real e revisão humana;
11. calibrar limites, ranking e orçamentos usando os resultados medidos.

## Critérios de sucesso

- continuidade contextual correta em pelo menos 95% dos episódios revisados;
- nenhuma pergunta repetida sobre informação já fornecida no mesmo assunto;
- nenhum procedimento operacional sem fonte publicada e autorizada;
- nenhuma fonte inacessível ou revogada na resposta final;
- zero vazamento de credenciais pessoais, tokens ou chaves;
- redução mensurável de falsos bloqueios do verificador;
- ausência de `claim_shape` causado por saída livre quando o modelo configurado suportar schema estrito;
- fallback seguro e útil para falha, recusa, interrupção ou saída inválida do provedor;
- respostas pontuais curtas e procedimentos completos entregues conforme o modo solicitado;
- ausência de artigo bruto, Markdown escapado e boilerplate interno na interface;
- baseline reproduzível por modelo, configuração e conjunto de casos.


## Etapa final — Validação e homologação

### Estado de referência

Em 27/11/2026, o commit de código `12cd501d9a394a81b0767c8e427badae080999b4` do PR [#84](https://github.com/matheusdebrito/suportai/pull/84), branch `natural-support-responses`, teve o [CI aprovado](https://github.com/matheusdebrito/suportai/actions/runs/46005694304): 309 testes na suíte geral, 306 aprovados, zero falhas, três casos opt-in ignorados e três testes E2E aprovados. A [auditoria de dependências](https://github.com/matheusdebrito/suportai/actions/runs/46005694261) também foi aprovada.

O código de continuidade, consulta contextual, modo de atendimento, Structured Outputs, fallback, chunking, captura de métricas, episódios ampliados e comparação de baseline está implementado e passou pelas verificações automatizadas do CI. Isso **não** equivale à homologação das respostas do modelo real. A avaliação real publicada anteriormente foi realizada no commit `036f2fa7f64ce1204ccdd5af0a3042d1d55554a6`, antes das últimas alterações.

Fontes de acompanhamento:

- este arquivo: requisitos, ordem de execução, critérios de aceitação e condições de encerramento;
- [implementation-progress.md](implementation-progress.md): checklist persistente, resultados, decisões, regressões e pendências;
- [docs/support-evaluation.md](docs/support-evaluation.md): protocolo técnico, comandos, configuração do ambiente e comparação dos relatórios;
- [docs/validation-pr-84.md](docs/validation-pr-84.md) e [evidências anteriores](docs/validation-pr-84-evidence/): resultados históricos, que devem permanecer intactos.

O estado de referência acima é histórico. Antes de cada rodada, verificar o HEAD atual e seus checks; não atribuir a um commit novo os resultados de um commit anterior.

### F1 — Preparar o ambiente e preservar o baseline (obrigatório)

- [ ] Sincronizar a branch do PR com o repositório remoto, preservando alterações locais não relacionadas. Usar `git fetch origin`, `git switch natural-support-responses` e `git pull --ff-only origin natural-support-responses`; confirmar o SHA com `git rev-parse HEAD`. Se a branch local não existir, criar uma branch de rastreamento da remota. Não usar reset destrutivo nem force push.
- [ ] Instalar as dependências conforme o lockfile, preparar um PostgreSQL/pgvector descartável, aplicar as migrations e verificar que o ambiente contém somente fixtures sintéticas.
- [ ] Configurar as variáveis descritas em [docs/support-evaluation.md](docs/support-evaluation.md): `NODE_ENV=test`, `RUN_REAL_EPISODES=1`, `DATABASE_URL` e `TEST_DATABASE_URL` iguais e referentes ao banco isolado, `ALLOW_EXTERNAL_AI_DATA_PROCESSING=true` exclusivamente para a avaliação sintética autorizada, e `EVALUATION_COMMIT` correspondente ao código avaliado.
- [ ] Usar credenciais autorizadas do ambiente local, sem imprimi-las, incluí-las nos relatórios ou usar o banco de produção. Registrar o modelo de chat, embeddings, temperatura, limites e hash do corpus. Para a comparação principal, manter `gpt-4.1-mini`, `text-embedding-3-small`, temperatura 0,2 e os limites do baseline histórico.
- [ ] Preservar a pasta `docs/validation-pr-84-evidence/`. Definir `EPISODE_REPORT_PATH`, `EXPANDED_EPISODE_REPORT_PATH` e `CALIBRATION_REPORT_PATH` como caminhos novos e distintos, sem sobrescrever as evidências anteriores.

**Aceitação:** ambiente isolado comprovado, configuração efetiva registrada e baseline histórico intacto. Sem acesso autorizado ao provedor ou banco adequado, marcar a avaliação como bloqueada; não substituir uma execução real por resultados simulados.

### F2 — Executar e revisar os episódios reais (obrigatório)

Executar no diretório `apps/api`:

```bash
node --import tsx --test src/investigation-chat.test.ts
```

Os três testes opt-in devem executar de fato, sem skip:

- `independent synthetic retrieval calibration corpus`;
- `real model phone episode with actual retrieval`;
- `expanded real HTTP support episode matrix`.

O episódio histórico e a matriz ampliada original somam seis episódios e 23 turnos. A seleção semântica acrescenta dois casos complementares (três turnos), totalizando oito episódios e 26 turnos na execução atual, sem substituir o corpus original:

| Episódio | Turnos | Comportamento a validar |
| --- | ---: | --- |
| Telefone de laboratório | 5 | Continuidade, confirmação curta, senha operacional e procedimento completo |
| Impressora de etiquetas | 4 | Confirmação negativa, pré-requisitos e progressão correta |
| RIS / ERP | 6 | Troca de assunto, isolamento entre sistemas e retomada da investigação |
| Digitalizador | 4 | Resposta pontual, preferência de atendimento e procedimento completo |
| Procedimento revogado | 2 | Revalidação de publicação e não exposição da fonte arquivada |
| Conhecimento restrito | 2 | Ausência de acesso e de conteúdo não autorizado |
| Seleção semântica de controlador (complementar) | 2 | Perguntar diante de alternativas e escolher a fonte correta após esclarecimento |
| Ficha de acesso incompleta (complementar) | 1 | Evidência parcial citada, sem passos inventados ou credenciais desnecessárias |

- [ ] Registrar respostas efetivas, identificação da investigação, modo, fontes e versões, ranking e cobertura dos chunks, resultado do verificador, códigos de falha, tentativas de recuperação, uso do fallback, latência e tokens por turno, distinguindo uso informado pelo provedor de estimativas.
- [ ] Confirmar que os casos de segurança não apresentam fontes revogadas, segredos ou conteúdo fora da autorização. Uma abstenção correta diante de falta de evidência não é uma falha de compreensão.
- [ ] Verificar a atuação do Structured Outputs com o modelo real: schema estrito, recusa/interrupção, rejeição de campos inválidos e distinção entre falha estrutural e semântica. Complementar os cenários de falha do provedor com testes determinísticos quando não for possível induzi-las de forma controlada no serviço real.
- [ ] Verificar o fallback por modo, incluindo preservação de condições, resposta focada, confirmação explícita antes de avançar e ausência de mistura de versões ou documentos.
- [ ] Reavaliar com fixture sintética a regressão de artigos que contêm apenas campos de acesso (por exemplo, pergunta de geração de voucher). Flexões curtas devem manter a operação correta; apresentar endereço confirmado e limite do trecho, sem inventar menus, confundir criar/revogar ou expor credenciais sem necessidade. Este caso complementar não altera os 23 turnos do baseline/matriz previamente definidos.
- [ ] Revisar individualmente os 26 turnos (23 do corpus original e três complementares). Avaliar clareza, naturalidade, resposta direta, completude, escopo, dependências, perguntas repetidas, avisos desnecessários, falsos bloqueios e falsas aceitações. Rotular separadamente a revisão por IA e a revisão humana; não tratar julgamento automatizado como aprovação humana.

**Aceitação:** todos os testes opt-in executados; nenhum acesso indevido, procedimento inventado, vazamento, avanço incompatível com o resultado relatado ou procedimento incompleto apresentado como completo. Aplicar os critérios de sucesso deste documento aos episódios revisados. Em oito episódios, atingir pelo menos 95% de continuidade exige os oito corretos; não extrapolar esse resultado para a população de conversas reais. Proxies de texto, regex e status HTTP não substituem a revisão semântica.

### F3 — Comparar os resultados com o baseline (obrigatório)

- [ ] Executar o comparador `episode:compare` conforme [docs/support-evaluation.md](docs/support-evaluation.md), usando o relatório histórico do telefone como referência e o novo relatório do mesmo episódio como candidato.
- [ ] Conferir a equivalência de modelo, embeddings, temperatura, limites, mensagens e corpus antes de interpretar deltas. Os cinco episódios adicionais constituem uma avaliação separada, com seu próprio hash e resultados.
- [ ] Comparar qualidade revisada, continuidade, falsos bloqueios, falsas aceitações, repetição, avisos, completude, fallbacks, recall, precisão e MRR. Comparar métricas de verificação, duração e consumo de tokens quando existirem valores equivalentes nas duas execuções.
- [ ] Não transformar valores ausentes em zero. O baseline anterior não contém a telemetria individual do verificador: `claim_shape`, latência e tokens históricos podem ser indisponíveis para comparação direta. Para demonstrar redução dessas métricas, obter um baseline histórico instrumentado em execução isolada, com mudanças apenas de observabilidade, sem alterar o comportamento avaliado; ou estabelecer um novo baseline instrumentado e medir uma rodada posterior. Registrar explicitamente qualquer limitação que permaneça.
- [ ] Registrar a origem dos rótulos e utilizar rótulos comparáveis; relatórios revisados por IA não substituem a homologação humana.
- [ ] Gerar um relatório de comparação versionado, preservando os resultados anteriores.

**Aceitação:** comparação reproduzível, sem deltas fabricados ou alterações de configuração destinadas apenas a melhorar números. Não declarar redução de falsos bloqueios ou custos sem medições comparáveis. Se a evidência de redução exigida pelos critérios de sucesso não puder ser obtida, registrar a pendência e o impacto sobre o parecer final.

### F4 — Corrigir regressões e consolidar o harness (obrigatório quando houver falhas)

- [ ] Classificar cada falha conforme a causa: roteamento/contexto, recuperação, síntese, verificação estrutural ou semântica, fallback, autorização, telemetria, contrato HTTP, teste ou infraestrutura.
- [ ] Reproduzir o problema, corrigir a causa-raiz com mudança mínima e adicionar um teste que reproduza a regressão.
- [ ] Reexecutar os testes afetados; ao concluir a rodada, executar typecheck, testes unitários/de integração, avaliação do RAG, build e as avaliações reais afetadas. Confirmar o CI completo do HEAD que será avaliado para merge, inclusive E2E, migrations, segurança e auditoria de dependências.
- [ ] Registrar no `implementation-progress.md` cada requisito, commit, evidência, resultado, bloqueio e ponto de retomada. Publicar um novo relatório de validação e resumo no PR, sem dados de produção nem credenciais.

**Aceitação:** nenhuma regressão conhecida de segurança ou de comportamento crítico, nenhum teste válido removido ou enfraquecido e todos os resultados atribuídos ao SHA correto. O agente de desenvolvimento pode corrigir bugs pontuais dentro do escopo da rodada; não deve iniciar refatorações amplas, novas funcionalidades ou ciclos ilimitados por conta própria. Ao concluir a rodada solicitada, apresentar resultados e pendências e aguardar orientação para uma nova rodada.

### F5 — Ampliar e calibrar o corpus do RAG (obrigatório para fundamentar a calibração; ajustes condicionais)

O corpus inicial possui quatro casos sintéticos: dois piloto e dois holdout. Recall, precisão e MRR de 1,0 nesse conjunto pequeno não demonstram qualidade representativa.

- [ ] Ampliar o corpus com consultas e documentos sintéticos representativos de equipamentos, sistemas, erros, variantes linguísticas, procedimentos longos, pré-requisitos, versões, fontes semelhantes porém incompatíveis, perguntas sem resposta e permissões restritas.
- [ ] Revisar os documentos e chunks esperados, congelar a divisão entre piloto e holdout antes de medir e registrar a cobertura dos casos de risco. Manter casos sem fonte relevante em avaliação separada de abstenção/segurança, pois a calibração atual exige versões esperadas não vazias.
- [ ] Executar `rag:calibrate` conforme o contrato do script e o protocolo de avaliação. Medir recall, precisão, MRR, cobertura dos chunks e distribuição dos scores quando disponível. Considerar também a qualidade conversacional, latência, tokens e limites do agente.
- [ ] Selecionar alterações de parâmetros somente com evidência do piloto, confirmá-las no holdout não usado para ajuste e repetir as regressões de segurança. Se não houver ganho sustentado, manter os parâmetros atuais.
- [ ] Documentar amostra, metodologia, parâmetros candidatos, política escolhida, métricas, limitações e decisão de aplicar ou não aplicar.

**Aceitação:** corpus ampliado e revisado, metodologia reproduzível e decisão sustentada por evidência. Alterar ranking, limiares semânticos/lexicais ou orçamento não é obrigação quando os resultados não justificarem a mudança. Não ajustar parâmetros usando exclusivamente o holdout. Nunca reduzir autorização ou grounding para melhorar métricas de recuperação.

### F6 — Gate de prontidão e autorização de merge

- [ ] Confirmar que F1–F4 foram concluídas, que os critérios de sucesso estão sustentados por evidências e que F5 recebeu parecer explícito. Caso alguma medição não possa ser concluída, distinguir pendência crítica de limitação residual e apresentar o impacto para decisão humana; não marcar requisito não comprovado como aprovado.
- [ ] Concluir a revisão humana e confirmar que não há falhas críticas de autorização, evidência, privacidade, continuidade, dependências procedurais ou integridade dos dados.
- [ ] Verificar CI e auditoria verdes no HEAD final; anexar links dos checks e dos relatórios. Distinguir os testes opt-in executados localmente dos skips intencionais do CI.
- [ ] Atualizar o checklist de progresso e emitir parecer de prontidão para merge, com limitações, riscos residuais e plano de deploy.

**Aceitação:** código aprovado, avaliações reais documentadas, qualidade homologada e requisitos rastreáveis. O CI verde isoladamente não autoriza o merge. O merge do PR #84 depende de autorização explícita do responsável; este documento não concede essa autorização.

### F7 — Deploy, reindexação controlada e homologação com usuários (após autorização)

Esta etapa é operacional e posterior ao gate do PR. Não executar contra produção durante a avaliação local.

- [ ] Planejar deploy e rollback, conferir configuração efetiva do modelo e do schema, migrations, health checks, backup verificável e observabilidade. Obter autorização específica para as operações de produção.
- [ ] Inventariar documentos publicados e vigentes que foram indexados pelo chunking antigo. Validar reindexação em ambiente de teste/homologação antes de executar em lotes controlados.
- [ ] Preservar conteúdo, versão, estado editorial, permissões e isolamento dos documentos. Não republicar, liberar acesso ou reindexar versões revogadas como efeito colateral. Evitar perda de disponibilidade durante a troca do índice; prever recuperação do índice anterior caso a estratégia falhe.
- [ ] Medir cobertura e recuperação antes e depois da reindexação, verificando especialmente documentos longos, chunks vizinhos, pré-requisitos e fontes restritas. Registrar duração, falhas, custos e plano de interrupção/rollback. Não iniciar reindexação automática sem autorização.
- [ ] Realizar piloto com usuários autorizados de TI, usando procedimentos reais somente no ambiente aprovado, sem copiar conteúdo restrito ou credenciais para relatórios de desenvolvimento. Verificar utilidade, naturalidade, correção factual, continuidade, feedback e latência; registrar problemas e critérios de expansão.
- [ ] Monitorar erros estruturais, rejeições, fallback por motivo, duração, consumo e sinais de regressão com métricas agregadas. Abrir novas correções a partir de evidências, preservando os controles de segurança.

**Aceitação:** deploy verificado, reindexação validada com plano de recuperação, ausência de regressões de autorização e homologação do piloto pelo responsável. Aprovação da implementação no PR e homologação operacional são marcos distintos.

### Ordem de execução e retomada

A próxima rodada deve começar em F1 e seguir F2, F3 e F4. F5 deve orientar a avaliação do RAG sem bloquear as verificações independentes; eventuais ajustes precisam repetir as validações afetadas antes de F6. F7 só ocorre depois da autorização de merge, deploy e operações correspondentes.

Manter este plano como referência e a checklist de execução no `implementation-progress.md`. Não apagar o histórico para marcar progresso. Em cada entrega, registrar o que foi implementado, o que foi efetivamente executado, o que permanece não verificado e a próxima atividade concreta. Não declarar o agente integralmente homologado enquanto existirem critérios de aceitação não comprovados.
