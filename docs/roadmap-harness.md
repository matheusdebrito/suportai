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

**Status das próximas fases:** todas as tarefas abaixo começam `[ ]`. O código listado acima é a base, não evidência de conclusão das melhorias futuras.

## 3. Visão das fases

| Fase | Prioridade | Foco | Itens do diagnóstico | Dependências | Estado |
| --- | --- | --- | --- | --- | --- |
| 1 | Crítica | Memória persistente e continuidade | #2 e #7 | Base atual; desenho de retenção | ☐ Não iniciada |
| 2 | Crítica | Planejamento investigativo e recuperação | #1, #6 e #10 | Fase 1, contratos do loop | ☐ Não iniciada |
| 3 | Alta | Recuperação RAG, grounding e comparação | #4, #5 e #9 | Fase 2; corpus sintético | ☐ Não iniciada |
| 4 | Média/alta | Concorrência, UX e observabilidade | #11 e #12 | Contratos das fases 1–3 | ☐ Não iniciada |
| 5 | Crítica para liberação | Avaliação real, português informal e calibração | #3 e #8; valida todas | Fases 1–4; autorização de LLM | ☐ Não iniciada |

A fase 5 pode **preparar os fixtures e a régua de qualidade desde a fase 1**, mas a certificação final depende das demais fases e da autorização para processamento externo.

---

## Fase 1 — Memória e continuidade de investigações

**Objetivo (H-REQ-001 / H-REQ-002):** acompanhar um problema através de conversas longas e mudanças de assunto, com separação explícita entre fatos relatados, hipóteses e diagnósticos confirmados.

**Implementações:**

- [ ] **H-T001 — Estado persistente da investigação.** Definir contrato de dados com: `conversation_id`, `user_id`, tópico/assunto, equipamento/sistema, ambiente, fatos informados, hipóteses, perguntas pendentes, testes executados, resultados e referências de fonte/versionamento. Campos opcionais, limites de tamanho e atualização por revisão otimista; não persistir credenciais ou texto integral de PDF.
- [ ] **H-T002 — Atualização e recuperação do contexto.** Derivar alterações do diálogo e carregar o assunto ativo, distinguindo referência ao problema anterior de troca de assunto. Anotações geradas pelo modelo são hipóteses até confirmação do usuário ou documento.
- [ ] **H-T003 — Revogação, retenção e isolamento.** Vincular contexto à conta e à revisão de autorização; revalidar referências a espaços/documentos a cada leitura, invalidar conteúdo revogado e estabelecer política de expiração/limpeza antes de persistir novos dados.
- [ ] **H-T004 — Testes da memória.** Exercitar conversas acima de 60 mensagens, retomada do assunto, dois problemas intercalados, duas contas, revogação de acesso, conteúdo malicioso e atualização simultânea.

**Aceitação (H-AC-001 e H-AC-002):** o agente consegue retomar um problema citado há mais de 60 mensagens sem recuperar dados não autorizados; uma troca explícita de assunto não mistura equipamentos ou versões. Histórico antigo não vira fonte oficial. Sem persistência de segredos.

**Riscos:** retenção de dados pessoais, migração PostgreSQL e memórias contaminadas por respostas incorretas. A política de retenção e qualquer migração de produção requerem revisão específica antes da execução.

## Fase 2 — Planejamento e recuperação autônoma

**Objetivo (H-REQ-003 / H-REQ-004 / H-REQ-005):** transformar pesquisas sucessivas em investigação orientada a objetivo, sem ampliar indevidamente os poderes do agente.

**Implementações:**

- [ ] **H-T005 — Plano de investigação interno.** Implementar estado por turno com objetivo, lacunas, hipóteses, evidências, próximos passos e critérios de parada; só fazer perguntas quando faltar detalhe indispensável. Não expor cadeia de raciocínio privada: registrar decisões e evidências operacionais resumidas.
- [ ] **H-T006 — Política de uso de ferramentas.** Escolher `search_knowledge`, leitura de documento, comparação, pergunta ou conclusão conforme o progresso. Impedir buscas repetidas, ciclos improdutivos, consultas fora do orçamento e chamadas sem benefício informacional.
- [ ] **H-T007 — Falhas recuperáveis e degradação segura.** Classificar indisponibilidade de RAG, timeout, resultados vazios, conflito de fontes e recusa de permissão. Tentar alternativas apenas em operações de leitura seguras, com limites de tentativa e sem ocultar falhas.
- [ ] **H-T008 — Calibração do loop.** Instrumentar motivo de parada, passos, ferramentas, duplicidade, cobertura e necessidade de esclarecimento. Ajustar limites atuais (8 etapas, 5 buscas e 60 s) somente a partir dos dados de avaliação.

**Aceitação (H-AC-003 a H-AC-005):** consultas simples param cedo; problemas complexos podem mudar de estratégia sem loop infinito; fontes ausentes/falhas não se tornam instruções inventadas; operações de escrita não são repetidas automaticamente.

**Riscos:** latência/custo e tentativas redundantes. Preservar os orçamentos e limites de autorização existentes até haver evidência para alterá-los.

## Fase 3 — RAG avançado, evidências e comparação

**Objetivo (H-REQ-006 / H-REQ-007 / H-REQ-008):** melhorar relevância, precisão e rastreabilidade das respostas técnicas.

**Implementações:**

- [ ] **H-T009 — Reranking e relevância.** Partir da recuperação híbrida já existente (texto + vetor), medir qualidade do top-k com corpus fictício, avaliar reranking de candidatos autorizados e relevância mínima. Provedor externo de reranking depende de autorização separada; preferir solução sem novo serviço se atender à qualidade.
- [ ] **H-T010 — Resposta orientada por afirmações.** Associar cada orientação operacional importante a trechos, versão e título de documento; revisar suportabilidade, pré-requisitos, negações e condições de ambiente. Quando a evidência não sustentar a resposta, explicitar a lacuna ou pedir dados adicionais.
- [ ] **H-T011 — Conflitos e versões.** Comparar procedimentos publicados do mesmo tema, distinguir documento vigente de histórico, detectar instruções divergentes e apresentar diferenças com fontes. Nunca selecionar versão antiga como procedimento atual sem explicação.
- [ ] **H-T012 — Testes adversariais de grounding.** Cobrir versões contraditórias, falsas citações, conteúdo incompleto, números/IPs inventados, documento revogado e prompt injection em artigo/PDF. Medir falso bloqueio e falso aceite do verificador, sem assumir infalibilidade da segunda chamada ao LLM.

**Aceitação (H-AC-006 a H-AC-008):** toda orientação operacional importante é rastreável a fonte publicada e autorizada; conflito ou lacuna relevante produz esclarecimento/abstenção; conteúdo não autorizado nunca entra no reranker ou na resposta.

**Riscos:** custos de inferência, falso positivo de verificação, documentos desatualizados e vazamento entre espaços.

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
| H-DEC-003 | ABERTO | Política de retenção/expiração da memória persistente | Definir antes de migrar dados persistentes |
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

**Próximo marco:** iniciar a **Fase 1 / H-T001**, com desenho do estado de investigação e política de retenção; preparar em paralelo H-T017 usando somente cenários fictícios.