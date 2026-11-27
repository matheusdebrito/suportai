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
