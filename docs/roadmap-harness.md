# Roadmap do Harness — SuportAI (nível 3 → nível 4)

**Versão:** 1.0  
**Data de referência:** 25/11/2026  
**Estado:** PLANEJADO — este documento não declara implementações futuras como concluídas  
**Objetivo:** evoluir o agente interno de TI para um agente investigativo confiável, sem transformar o SuportAI em uma plataforma multiagente ou liberar ações operacionais autônomas.

> **Como usar:** executar as fases na ordem de dependência, preferencialmente um PR verificável por entrega; atualizar o status e anexar as evidências do CI após cada merge. A integração do código não equivale à aprovação para uso com dados internos reais.

## 1. Escopo e princípios

O SuportAI deve entender solicitações em português do Brasil (inclusive informal), identificar quando falta contexto, investigar artigos/PDFs publicados, comparar evidências e responder com fontes autorizadas. Uma resposta sem evidência suficiente deve explicar a limitação, não inventar um procedimento.

**Invariantes em todas as fases:**

- **Permissões no backend:** todo acesso ao RAG, documentos, versões, memórias e citações respeita usuário, espaço, versão e revogação de autorização. Nunca usar autorização concedida apenas pela IA.
- **Conhecimento não confiável:** conteúdo de artigos/PDFs é dado, não instrução. Prevenir prompt injection, vazamento de segredos e citações inventadas.
- **Escrita supervisionada:** a IA pode propor rascunhos, mas criar, revisar, aprovar ou publicar exige os contratos e confirmações humanas existentes. Nenhum comando de infraestrutura é executado.
- **Sem mudança de provedor implícita:** não habilitar envio externo de dados corporativos; ensaios reais usam apenas fixtures sintéticas e opt-in autorizado.
- **Simplicidade:** um agente com ferramentas e backend seguro; sem multiagente, orquestradores externos ou infraestrutura adicional sem evidência de necessidade.
- **Entrega verificável:** testes automatizados, integração PostgreSQL, observabilidade, documentação de riscos e resultado do CI antes de encerrar tarefas.

**Fora do escopo deste roadmap:** OCR de PDF, execução remota de comandos/SSH, publicação autônoma, integração com sistemas corporativos adicionais, expansão obrigatória para outros departamentos, deploy de produção e redefinição da política de retenção da empresa. Esses itens dependem de decisões próprias.

## 2. Linha de base já implementada

Implementações presentes na `main`, conforme PRs [#69](https://github.com/matheusdebrito/suportai/pull/69), [#70](https://github.com/matheusdebrito/suportai/pull/70) e [#71](https://github.com/matheusdebrito/suportai/pull/71):

| Capacidade existente | Evidência de código | Limite conhecido |
| --- | --- | --- |
| Pergunta de esclarecimento, pesquisa e escolha de ferramentas | `apps/api/src/agent.ts` | Compreensão do modelo real ainda não medida |
| Loop adaptativo: 8 etapas, 5 buscas, tempo/tokens limitados | `agent-budget.ts` | Tetos iniciais não calibrados por benchmark |
| Conversa e memória de até 60 mensagens | `chat.ts`, `conversation-memory.ts` | Apenas 8 turnos recentes íntegros + memória derivada; sem estado duradouro além da janela |
| Documento atual, versões e permissões | `agent-knowledge-tools.ts` | Comparação crítica ainda precisa de avaliação qualitativa |
| Revisão de intenção de escrita e verificação semântica | `agent-intent.ts`, `agent-verifier.ts` | Segunda opinião de LLM não é prova formal de correção |
| Serialização de mensagens da mesma conversa | `conversation-lock.ts` | Requisição simultânea recebe HTTP 409; sem fila/idempotência de ponta a ponta |
| Testes conversacionais | `agent-conversation-scenarios.test.ts`, `rag-evaluation.ts` | 100 contratos simulados e 16 cenários fictícios opt-in; sem homologação de compreensão real |

O CI do PR #71 foi aprovado ([execução 45605549638](https://github.com/matheusdebrito/suportai/actions/runs/45605549638)). Isso verifica contratos automatizados, **não** a precisão do comportamento de um modelo real nem a segurança do ambiente de produção.

**Status das próximas fases:** a Fase 1 registra a evidência de cada entrega abaixo. As Fases 2 a 5 seguem planejadas.

## 3. Visão das fases

| Fase | Prioridade | Foco | Itens do diagnóstico | Dependências | Estado |
| --- | --- | --- | --- | --- | --- |
| 1 | Crítica | Memória persistente e continuidade | #2 e #7 | Base atual; decisão de retenção H-DEC-003 | Concluída |
| 2 | Crítica | Planejamento investigativo e recuperação | #1, #6 e #10 | Fase 1, contratos do loop | Concluída |
| 3 | Alta | Recuperação RAG, grounding e comparação | #4, #5 e #9 | Fase 2; corpus sintético | Em andamento |
| 4 | Média/alta | Concorrência, UX e observabilidade | #11 e #12 | Contratos das fases 1–3 | ☐ Não iniciada |
| 5 | Crítica para liberação | Avaliação real, português informal e calibração | #3 e #8; valida todas | Fases 1–4; autorização de LLM | ☐ Não iniciada |

A fase 5 pode **preparar os fixtures e a régua de qualidade desde a fase 1**, mas a certificação final depende das demais fases e da autorização para processamento externo.

---

## Fase 1 — Memória e continuidade de investigações

**Objetivo (H-REQ-001 / H-REQ-002):** acompanhar um problema através de conversas longas e mudanças de assunto, com separação explícita entre fatos relatados, hipóteses e diagnósticos confirmados.

**Implementações:**

- [x] **H-T001 — Estado persistente da investigação.** Definir contrato de dados com: `conversation_id`, `user_id`, tópico/assunto, equipamento/sistema, ambiente, fatos informados, hipóteses, perguntas pendentes, testes executados, resultados e referências de fonte/versionamento. Campos opcionais, limites de tamanho e atualização por revisão otimista; não persistir credenciais ou texto integral de PDF.
- [x] **H-T002 — Atualização e recuperação do contexto.** Derivar alterações do diálogo e carregar o assunto ativo, distinguindo referência ao problema anterior de troca de assunto. Anotações geradas pelo modelo são hipóteses até confirmação do usuário ou documento.
- [x] **H-T003 — Revogação, retenção e isolamento.** Vincular contexto à conta e à revisão de autorização; revalidar referências a espaços/documentos a cada leitura, invalidar conteúdo revogado e estabelecer política de expiração/limpeza antes de persistir novos dados.
- [x] **H-T004 — Testes da memória.** Exercitar conversas acima de 60 mensagens, retomada do assunto, dois problemas intercalados, duas contas, revogação de acesso, conteúdo malicioso e atualização simultânea.

### Contrato inicial da H-T001

A migração `006_investigation_state.sql` define um registro por assunto, vinculado ao proprietário da conversa e à revisão de autorização da conta. Cada registro tem revisão própria para controle de concorrência, além de assunto, equipamento ou sistema, ambiente e última atividade. As notas separam fatos relatados, hipóteses, perguntas pendentes e testes, com resultado opcional vinculado ao teste. As fontes guardam o ID da versão, que identifica também o documento associado.

O backend compara a revisão esperada e grava o estado, as notas e as referências na mesma transação. A leitura e a atualização filtram por conta, conversa, revisão de autorização e prazo de 30 dias. Se uma fonte ficar indisponível, o estado fica oculto, inclusive quando uma versão for excluída.

### Integração inicial da H-T002

O chat identifica mudanças explícitas de assunto, retomadas pelo nome e continuações do assunto anterior. Cada turno usa apenas o estado e as mensagens do assunto selecionado. O sistema guarda observações relatadas, hipóteses do usuário, perguntas e testes em campos distintos e persiste a atualização na mesma transação da resposta. Uma resposta dependente de fonte que se tornou inacessível deixa de ser exibida ou reutilizada.

A seleção usa padrões de português e correspondência por assunto ou equipamento. Retomadas explícitas sem correspondência e escolhas ambíguas pedem esclarecimento. A integração tem testes de API com PostgreSQL local e resposta simulada, incluindo retomada após mais de 60 mensagens, troca de assunto e arquivamento de fonte. A compreensão com um modelo real permanece para avaliação posterior.

### Limpeza de estados expirados na H-T003

O worker verifica estados expirados ao iniciar e depois a cada hora. A rotina exclui investigações com mais de 30 dias desde a última atividade, em lotes de até 100. Um lote cheio é seguido de outra verificação após o próximo ciclo de processamento do worker. A exclusão remove as notas e referências da investigação. As mensagens, o feedback e os marcadores de assunto permanecem no histórico.

### Evidências da H-T001 à H-T003

- **H-T001.** A integração PostgreSQL verificou o isolamento entre contas, os limites do esquema, a rejeição de credenciais detectadas e a concorrência entre duas gravações com a mesma revisão.
- **H-T002.** O teste da API retomou uma investigação depois de 65 mensagens sobre outro assunto e verificou que a troca de contexto preservou os dois estados. A resposta do modelo foi simulada.
- **H-T003.** Os testes verificaram revogação de acesso, arquivamento e exclusão de fontes e o limite exato de 30 dias. O worker foi testado no PostgreSQL local com dados fictícios e preservou as mensagens da investigação expirada.

O CI aprovado incluiu migrações, testes de integração PostgreSQL, build, Playwright e ensaio de restauração com dados fictícios. A avaliação com modelo real e a homologação do piloto seguem na Fase 5. [PR #73](https://github.com/matheusdebrito/suportai/pull/73) · [Commit de implementação `bb988ca`](https://github.com/matheusdebrito/suportai/commit/bb988ca4cabe173d15666f146fa6f5e76bb9056e) · [CI #45639697456](https://github.com/matheusdebrito/suportai/actions/runs/45639697456)

### Evidências da H-T004

Os testes de integração retomam um assunto após 65 mensagens, alternam entre dois assuntos com versões distintas e isolam investigações de mesmo nome em duas contas. Também verificam a revogação durante uma resposta, o tratamento de instruções na memória como dados não verificados, a recusa de acesso a uma fonte restrita e o bloqueio de um turno simultâneo sem duplicar mensagens ou avançar a revisão.

Passaram 11 testes no PostgreSQL local e o CI do PR. Os cenários usam dados fictícios e um modelo simulado. [PR #74](https://github.com/matheusdebrito/suportai/pull/74) · [Commit de testes `02421ba`](https://github.com/matheusdebrito/suportai/commit/02421bacac620888ac62e302f0731316cf065c03) · [CI #45642172138](https://github.com/matheusdebrito/suportai/actions/runs/45642172138)

**Aceitação (H-AC-001 e H-AC-002):** o agente consegue retomar um problema citado há mais de 60 mensagens sem recuperar dados não autorizados; uma troca explícita de assunto não mistura equipamentos ou versões. Histórico antigo não vira fonte oficial. Sem persistência de segredos.

**Riscos:** retenção de dados pessoais, migração PostgreSQL e memórias contaminadas por respostas incorretas. A política de retenção e qualquer migração de produção requerem revisão específica antes da execução.

## Fase 2 — Planejamento e recuperação autônoma

**Objetivo (H-REQ-003 / H-REQ-004 / H-REQ-005):** transformar pesquisas sucessivas em investigação orientada a objetivo, sem ampliar indevidamente os poderes do agente.

**Implementações:**

- [x] **H-T005 — Plano de investigação interno.** Implementar estado por turno com objetivo, lacunas, hipóteses, evidências, próximos passos e critérios de parada; só fazer perguntas quando faltar detalhe indispensável. Não expor cadeia de raciocínio privada: registrar decisões e evidências operacionais resumidas.
- [x] **H-T006 — Política de uso de ferramentas.** Escolher `search_knowledge`, leitura de documento, comparação, pergunta ou conclusão conforme o progresso. Impedir buscas repetidas, ciclos improdutivos, consultas fora do orçamento e chamadas sem benefício informacional.
- [x] **H-T007 — Falhas recuperáveis e degradação segura.** Classificar indisponibilidade de RAG, timeout, resultados vazios, conflito de fontes e recusa de permissão. Tentar alternativas apenas em operações de leitura seguras, com limites de tentativa e sem ocultar falhas.
- [x] **H-T008 — Calibração do loop.** Instrumentar motivo de parada, passos, ferramentas, duplicidade, cobertura e necessidade de esclarecimento. Ajustar limites atuais (8 etapas, 5 buscas e 60 s) somente a partir dos dados de avaliação.

**Aceitação (H-AC-003 a H-AC-005):** consultas simples param cedo; problemas complexos podem mudar de estratégia sem loop infinito; fontes ausentes/falhas não se tornam instruções inventadas; operações de escrita não são repetidas automaticamente.

**Riscos:** latência/custo e tentativas redundantes. Preservar os orçamentos e limites de autorização existentes até haver evidência para alterá-los.

### Implementação e calibração da Fase 2

Cada turno usa um plano em memória com objetivo, hipóteses relatadas, lacunas e evidências. O resultado das ferramentas orienta a próxima decisão entre explorar, reformular, inspecionar, recuperar uma leitura ou concluir. O plano encerra a busca de ferramentas após duas etapas consecutivas sem progresso e mantém a possibilidade de pedir um detalhe indispensável antes de orientar o usuário.

O loop distingue buscas vazias, timeout, indisponibilidade, referências inacessíveis e conflitos identificados na verificação de evidência. Uma falha pode levar a outra leitura útil dentro do orçamento. A preparação de uma prévia de artigo tem uma tentativa por turno, e a confirmação humana continua obrigatória.

Os testes de contrato medem chamadas e resultados. Uma consulta simples usa duas chamadas de geração e uma busca, e um pedido ambíguo pode terminar em uma pergunta sem busca. Consultas distintas com evidência idêntica provocam síntese antecipada após duas etapas sem progresso. O avaliador registra passos, ferramentas, duplicidades, esclarecimentos, motivos de parada, latência e proporção de leituras que acrescentam evidência. Mantivemos os tetos de 8 etapas, 5 buscas e 60 segundos. Os casos simulados verificam o comportamento do loop, e a calibração com modelo real segue na Fase 5.

Passaram 186 testes locais com PostgreSQL descartável. A integração verificou a comparação de versões publicadas e históricas e confirmou que repetir a preparação de um artigo gera uma única prévia. O CI passou com migrações, integração, build, Playwright e ensaio de restauração. [PR #75](https://github.com/matheusdebrito/suportai/pull/75) · [Commit de implementação `18e4e5c`](https://github.com/matheusdebrito/suportai/commit/18e4e5c3b551bc9e57db0898f1ffc9f4cbc2343f) · [CI #45646612590](https://github.com/matheusdebrito/suportai/actions/runs/45646612590)

## Fase 3 — RAG avançado, evidências e comparação

**Objetivo (H-REQ-006 / H-REQ-007 / H-REQ-008):** melhorar relevância, precisão e rastreabilidade das respostas técnicas.

**Implementações:**

- [ ] **H-T009 — Reranking e relevância.** Partir da recuperação híbrida já existente (texto + vetor), medir qualidade do top-k com corpus fictício, avaliar reranking de candidatos autorizados e relevância mínima. Provedor externo de reranking depende de autorização separada; preferir solução sem novo serviço se atender à qualidade.
- [ ] **H-T010 — Resposta orientada por afirmações.** Associar cada orientação operacional importante a trechos, versão e título de documento; revisar suportabilidade, pré-requisitos, negações e condições de ambiente. Quando a evidência não sustentar a resposta, explicitar a lacuna ou pedir dados adicionais.
- [ ] **H-T011 — Conflitos e versões.** Comparar procedimentos publicados do mesmo tema, distinguir documento vigente de histórico, detectar instruções divergentes e apresentar diferenças com fontes. Nunca selecionar versão antiga como procedimento atual sem explicação.
- [ ] **H-T012 — Testes adversariais de grounding.** Cobrir versões contraditórias, falsas citações, conteúdo incompleto, números/IPs inventados, documento revogado e prompt injection em artigo/PDF. Medir falso bloqueio e falso aceite do verificador, sem assumir infalibilidade da segunda chamada ao LLM.

**Aceitação (H-AC-006 a H-AC-008):** toda orientação operacional importante é rastreável a fonte publicada e autorizada; conflito ou lacuna relevante produz esclarecimento/abstenção; conteúdo não autorizado nunca entra no reranker ou na resposta.

**Riscos:** custos de inferência, falso positivo de verificação, documentos desatualizados e vazamento entre espaços.

### Implementação e avaliação da Fase 3

O PostgreSQL autoriza e limita os candidatos da recuperação híbrida antes da reordenação local. O reranker privilegia a cobertura dos termos específicos, descarta duplicatas do mesmo documento e exige sobreposição lexical útil ou similaridade vetorial de pelo menos 0,56 para manter um candidato. A avaliação compara o ranking original com o novo no mesmo conjunto de candidatos. Nas três consultas lexicais fictícias, o documento esperado passou de fora do top 3 para a primeira posição. Recall@3 e MRR@3 passaram de 0 para 1 nesse conjunto controlado. Vetores sintéticos verificam o limite mínimo e a revogação impede acesso antes do ranking.

O backend numera as citações após a revisão de cada unidade de resposta. Toda afirmação precisa de trechos exatos da versão citada, e números e endereços precisam aparecer nos trechos da própria unidade. A comparação distingue versões vigentes e históricas, e o chat revalida a autorização antes de persistir a resposta e ao recarregar o histórico. Divergências entre fontes vigentes podem interromper a orientação e gerar uma pergunta sobre o ambiente ou a versão aplicável.

O benchmark fictício tem 13 casos rotulados, com 3 aceitações esperadas e 10 rejeições esperadas. Ele mede separadamente falso aceite e falso bloqueio. Os ensaios locais e de CI usam um verificador simulado e conferem também a recusa de citações falsas, trechos ausentes e dados fora da autorização. As taxas com modelo real dependem da avaliação autorizada da Fase 5.

## Fase 4 — Concorrência, experiência e observabilidade

**Objetivo (H-REQ-009 / H-REQ-010):** garantir ordem e idempotência da conversa, além de tornar mensuráveis o desempenho e os motivos das falhas.

**Implementações:**

- [ ] **H-T013 — Idempotência por envio.** Adotar identificador de mensagem/requisição e tratamento de retries do cliente, impedindo duplicação de histórico, propostas pendentes e custos de chamadas. Manter contrato compatível ou versionado.
- [ ] **H-T014 — Política de mensagens concorrentes.** Avaliar manter HTTP 409 com retry controlado ou adicionar fila curta por conversa, com backpressure, cancelamento seguro e estados de processamento no frontend. Não segurar conexão de banco sem orçamento.
- [ ] **H-T015 — Telemetria orientada a qualidade.** Medir por execução: latência p50/p95, passos, buscas úteis, taxa de esclarecimento, erros, estimativa de custo, motivo de parada, taxa de abstenção e avaliação do usuário. Usar IDs de correlação e agregações, sem armazenar prompts ou documentos em logs.
- [ ] **H-T016 — Testes de concorrência e operação.** Simular mensagens simultâneas na mesma conversa, duplicações/retries, permissão revogada durante a resposta, desconexão do cliente, saturação do pool e múltiplas instâncias.

**Aceitação (H-AC-009 e H-AC-010):** cada mensagem lógica gera no máximo um resultado persistido; a ordem da conversa permanece consistente; métricas são úteis para diagnóstico e não expõem informações restritas.

**Riscos:** migrações/contratos de API, filas órfãs, contenção PostgreSQL e armazenamento de dados de observabilidade.

## Fase 5 — Avaliação conversacional e homologação

**Objetivo (H-REQ-011 / H-REQ-012):** demonstrar que o modelo real compreende e investiga corretamente antes de atribuir o nível 4 ao agente.

**Implementações:**

- [ ] **H-T017 — Dataset independente.** Criar conjunto revisado de pelo menos 100 casos fictícios com linguagem natural, gírias, erros de digitação, respostas curtas, confirmações, mudanças de assunto, conversas longas, conflito de procedimentos e ausência de fontes; separar casos de desenvolvimento e de validação.
- [ ] **H-T018 — Avaliador com modelo real, opt-in.** Reusar `rag-evaluation.ts`, ampliar diversidade e cobertura dos fluxos completos; registrar versão do modelo, configuração, uso de ferramentas, custo, latência, fontes e motivos de erro. Exigir autorização formal do provedor/custos antes de executar. Nunca conectar esse teste a documentos internos sem aprovação específica.
- [ ] **H-T019 — Comparação e correção.** Estabelecer baseline do PR #71 e comparar evolução por fase (com controle de regressões). Corrigir falhas de intenção, memória, seleção de busca e grounding com testes específicos; não enfraquecer critérios para melhorar artificialmente as notas.
- [ ] **H-T020 — Homologação de piloto e parecer.** Executar revisão humana por pessoal autorizado de TI, registrar cenários aprovados/falhos, risco residual, decisão de liberação e procedimento de rollback. Atualizar `verification.md` e manter T025 do MVP aberta até evidência real suficiente.

**Critérios de saída propostos (H-AC-011 / H-AC-012):**

| Métrica | Meta candidata, a validar antes de homologar |
| --- | --- |
| Resolução correta nos cenários independentes | ≥ 90% |
| Orientações técnicas sustentadas por fontes apropriadas | ≥ 98% |
| Continuidade contextual correta (incluindo mudanças de assunto) | ≥ 95% |
| Acesso indevido a conteúdo restrito em testes | **0 ocorrência** |
| Comportamento sob falhas e latência | Sem instrução inventada; p95 e custo dentro de orçamento definido após baseline |

Esses valores são **propostas de critérios**, não resultados alcançados nem compromissos de SLA. A escolha final deve considerar a criticidade dos procedimentos e os dados do piloto. Casos de segurança não são compensados por uma nota média alta.

## 4. Rastreabilidade das 12 melhorias

| Diagnóstico | Requisito | Fase | Tarefas | Aceitação |
| --- | --- | --- | --- | --- |
| 1. Planejamento autônomo | H-REQ-003 | 2 | H-T005, H-T006 | H-AC-003 |
| 2. Memória persistente | H-REQ-001 | 1 | H-T001, H-T003 | H-AC-001 |
| 3. Avaliação com modelo real | H-REQ-011 | 5 | H-T017–H-T020 | H-AC-011 |
| 4. RAG inteligente / reranking | H-REQ-006 | 3 | H-T009 | H-AC-006 |
| 5. Grounding por afirmação | H-REQ-007 | 3 | H-T010, H-T012 | H-AC-007 |
| 6. Recuperação de erros | H-REQ-004 | 2 | H-T007 | H-AC-004 |
| 7. Contexto e mudança de assunto | H-REQ-002 | 1 | H-T002, H-T004 | H-AC-002 |
| 8. Português informal | H-REQ-012 | 5 | H-T017, H-T019 | H-AC-012 |
| 9. Comparação de documentos | H-REQ-008 | 3 | H-T011, H-T012 | H-AC-008 |
| 10. Loop adaptativo | H-REQ-005 | 2 | H-T008 | H-AC-005 |
| 11. Observabilidade | H-REQ-010 | 4 | H-T015, H-T016 | H-AC-010 |
| 12. Concorrência e UX | H-REQ-009 | 4 | H-T013, H-T014 | H-AC-009 |

Prefixos `H-REQ`, `H-AC` e `H-T` são específicos deste roadmap; não alteram nem renumeram os IDs de `spec.md` ou `tasks.md` do MVP.

## 5. Regras de execução e atualização

**Antes de abrir cada PR**
1. Identificar tarefa(s) H-T e o critério H-AC correspondente, revalidar interfaces existentes e riscos de segurança.
2. Definir testes de sucesso, falha, acesso negado e regressão; separar mudanças de schema em migrations reversíveis/revisáveis.
3. Registrar decisões novas ou abertas (privacidade, retenção, custos, arquitetura) sem tratá-las como aprovadas tacitamente.

**Para encerrar cada tarefa**
1. Código e testes versionados em PR pequeno, com revisão do diff.
2. Typecheck, testes unitários, integração PostgreSQL e segurança; Playwright e build quando envolverem API/frontend, além das verificações do pipeline aplicáveis.
3. CI verde, evidência rastreável, documentação atualizada e revisão de impacto em permissões/RAG.
4. Só então marcar `[x]` nesta página e registrar PR, commit, execução de CI e ressalvas. Testes simulados não fecham os critérios com LLM real.

**Dependências e paralelismo:** o conjunto de avaliação fictícia (H-T017) pode começar desde já sem chamadas externas. Métricas (H-T015) podem avançar em paralelo com fases 2–3, mantendo contratos claros; fila/idempotência não devem ser implementadas independentemente sem definição do contrato. As fases 1 e 3 podem precisar de migrations — nunca executar alterações destrutivas em produção sem revisão explícita.

## 6. Decisões e pendências

| ID | Estado | Decisão / dependência | Diretriz |
| --- | --- | --- | --- |
| H-DEC-001 | VALIDADO (base existente) | Conhecimento compartilhado/restrito, autorização no backend e confirmação editorial humana | Não flexibilizar |
| H-DEC-002 | ASSUMIDO (roadmap) | Priorizar monolito modular e agente único | Reavaliar só com benchmark/necessidade técnica |
| H-DEC-003 | DECIDIDO | Expirar o estado após 30 dias de inatividade por investigação | Só atividade no próprio assunto renova o prazo. O estado expirado fica indisponível para leitura e entra na rotina de limpeza. A exclusão da conversa apaga o estado associado. Revogação de acesso é aplicada na próxima leitura, independentemente do prazo. O histórico do chat segue sua política própria. |
| H-DEC-004 | ABERTO | Provedor, custos e processamento de dados externos para avaliação real | Opt-in e aprovação específica |
| H-DEC-005 | ABERTO | HTTP 409 com retry vs fila por conversa e contrato de idempotência | Decidir com testes de UX/carga |
| H-DEC-006 | ABERTO | Limiar de relevância, reranking e metas finais de qualidade/custo | Calibrar com corpus e baseline |
| H-DEC-007 | ABERTO | Liberação para dados internos reais e piloto | Depende de revisão humana e requisitos operacionais do MVP |

## 7. Referências de projeto

- [Especificação original](../specs/001-agente-corporativo-conhecimento/spec.md)
- [Plano técnico original](../specs/001-agente-corporativo-conhecimento/plan.md)
- [Tarefas do MVP](../specs/001-agente-corporativo-conhecimento/tasks.md)
- [Evidências e riscos de validação](../specs/001-agente-corporativo-conhecimento/verification.md)
- [Avaliação RAG e harness atual](avaliacao-rag.md)
- [Runbook de operação](operacao.md)

**Próximo marco:** iniciar a **Fase 3** pela **H-T009**, com medição de relevância e avaliação de reranking sobre um corpus fictício. A **H-T017** pode avançar em paralelo com cenários fictícios.
