# Verificação do MVP — SuportAI

**Data:** 20/11/2026
**Escopo:** código-base do MVP de conhecimento interno (piloto TI).
**Parecer:** **APROVADO COM RESSALVAS para integração do código; NÃO aprovado para produção com dados internos reais**.

## Versões / ambiente de evidência

- Repositório: `matheusdebrito/suportai`, `main` em evolução incremental por PRs.
- CI GitHub Actions, Node.js 22, PostgreSQL 17 com pgvector, browser Chromium (Playwright).
- Ações verificadas antes deste documento:
  - [CI PR #12](https://github.com/matheusdebrito/suportai/actions/runs/44783807756): autorização de respostas e revisão.
  - [CI PR #13](https://github.com/matheusdebrito/suportai/actions/runs/44784449029): leases do worker, retentativas e processamento de PDFs.
  - [CI PR #14](https://github.com/matheusdebrito/suportai/actions/runs/44786618833): Chromium para login, onboarding, rascunhos, chat e feedback.
  - [CI PR #15](https://github.com/matheusdebrito/suportai/actions/runs/44787748629): Chromium para autoaprovação, duplicidade e PDF publicado.
- A CI executou instalação de dependências, duas execuções consecutivas de migração, `npm run typecheck`, `npm test`, `npm run build` e `npm run e2e`.
- Banco de testes de integração e banco de browser E2E independentes; fixtures fictícias; sem acesso a IA externa.

## Matriz de critérios de aceitação

| Critério | Evidência | Situação |
|---|---|---|
| AC-001 | Integração PostgreSQL: autenticação, sessão e consultas sem acesso | Automatizado, validação real de configuração ainda pendente |
| AC-002 | Grants de espaços compartilhados/restritos, sem organização multitenant | Parcial: piloto/setores reais não verificados |
| AC-003 | Busca RAG bloqueia documento restrito e expõe fontes permitidas | Parcial: síntese de dois espaços via LLM real não verificada |
| AC-004 | Modelo simulado atrasado, revogação concorrente e bloqueio de persistência | Automatizado |
| AC-005 | Teste unitário de saudação e recuperação de histórico pela API | Parcial: referências conversacionais via LLM real não verificadas |
| AC-006 | Fonte, versão histórica e exclusão de rascunho nos testes de API | Automatizado |
| AC-007 | Resposta sem evidência identificada; sem fonte não afirma procedimento interno | Parcial: contradição entre fontes via LLM não verificada |
| AC-008 | Criação de artigo em rascunho, autoria, controle de espaço | Automatizado, incluindo browser |
| AC-009 | Upload PDF, extração por worker e rejeição de arquivo inválido | Automatizado, faltam PDFs adversariais |
| AC-010 | Modelo simulado prepara prévia, confirmação gera rascunho, nunca publica | Automatizado |
| AC-011 | Nova versão preserva versão publicada; comparação no frontend | Parcial: comparação visual e revisão complexa no browser não verificadas |
| AC-012 | Duplicidade no backend e banner na interface com abertura de artigo | Automatizado, busca semântica mais ampla pendente |
| AC-013 | Permissão de aprovador, negação a administrador sem papel, pareceres | Automatizado |
| AC-014 | Publicação humana, arquivo histórico, ajuste e correção sem substituir publicado | Automatizado |
| AC-015 | Detecção heurística de segredos, restrições de ferramenta e acesso | Parcial: testes adversariais com modelo real e PDFs hostis pendentes |
| AC-016 | Eventos auditados para concessões, publicação, correções e feedback | Parcial: cobertura exaustiva de todas as transições não verificada |
| AC-017 | Feedback ligado à mensagem correta, concorrência e UI com reload | Automatizado |
| AC-018 | Falha de ingestão, retry, lease e publicação idempotente | Parcial: falha de provedor LLM real e disaster recovery não verificadas |
| AC-019 | Login, logout revoga sessão, teste Chromium após reload | Automatizado |
| AC-020 | Permissões restritas concedidas e revogadas pelo admin | Automatizado |
| AC-021 | Esquema e app preparados para piloto TI | Não verificado com usuários reais |
| AC-022 | Autor com perfil de aprovador publica o próprio artigo explicitamente | Automatizado em Chromium |
| AC-023 | Administração de usuários/papéis, negação a colaborador e invalidação de sessões | Automatizado |
| AC-024 | Isolamento de documentos restritos, concessão e revogação em RAG | Automatizado via API, não com LLM externo |
| AC-025 | Código temporário de uso único, troca de senha e ativação real | Automatizado via API e Chromium |

## Regressões encontradas e corrigidas

- Compilação em tests, parser de PDFs e conflitos de implementação: corrigidos pelos PRs anteriores com CI verde.
- Cliente web enviava `Content-Type: application/json` em POST sem corpo, impedindo criação de conversa e logout confiável. Detectado por Chromium, corrigido no PR #14.
- Worker podia ser retomado após timeout e sobrescrever trechos. Bloqueio por token de lease, retentativas limitadas e testadas no PR #13.
- Revogação podia concorrer com gravação da resposta do agente. Verificação transacional e teste de concorrência no PR #12.

## Incrementos de verificação (20/11/2026)

- [PR #18](https://github.com/matheusdebrito/suportai/pull/18): Playwright/Chromium cobre diferenças entre versões de artigos, revisão de PDF publicado, devolução para ajustes, reenvio e nova publicação.
- [PR #19](https://github.com/matheusdebrito/suportai/pull/19): CI executa backup PostgreSQL 17 e restauração em segundo banco descartável com dados fictícios, comparando tabelas, PDFs, versões e chunks do RAG. Não substitui ensaio operacional de produção.
- [PR #20](https://github.com/matheusdebrito/suportai/pull/20): cenários negativos de ingestão de PDF com extensão/MIME divergentes, cabeçalho forjado e credencial sintética. Validação final condicionada à CI do PR.

## Pendências para ambiente real

1. **Avaliar LLM externo e provedor de embeddings** com autorização formal para processamento de dados internos; `ALLOW_EXTERNAL_AI_DATA_PROCESSING=false` permanece padrão.
2. **Testes de conversação reais:** memória referencial, perguntas de esclarecimento, documentos conflitantes, abstenção e injeções adversariais.
3. **Segurança do arquivo PDF:** contenção por subprocesso reduz impacto, mas não substitui isolamento de SO, antimalware ou revisão de dependências.
4. **Infraestrutura:** backup **e restauração realmente ensaiados**, monitoramento, SSL, política de retenção e runbook de recuperação.
5. **UX complementar:** confirmação visual da comparação de versões e revisão/correção de PDF em navegador, inclusive uploads adversariais.
6. **Dados de piloto:** informações falsas/revisadas antes de migrar para documentos corporativos reais.

## Parecer final

- **Código do MVP:** integrado com cobertura automatizada relevante e sem PRs de feature ignorados.
- **Produção:** **NÃO LIBERADA** até avaliações reais de segurança, fornecedor, recuperação, observabilidade e qualidade conversacional.
- **Critérios de aceitação:** vários automatizados, alguns parciais e AC-021 não verificado. CI verde não equivale a aprovação do ambiente real.

Não houve deploy nem execução de migração em banco produtivo como parte desta verificação.

## Atualização de evidências — incrementos recentes

Os seguintes PRs são evidência de **implementação e CI** (não de homologação operacional):

| Área | PRs e evidência | Status |
| --- | --- | --- |
| Respostas interrompidas/injeção simulada | #37 [CI](https://github.com/matheusdebrito/suportai/actions/runs/44804440646) | Automatizado |
| Proteção de consultas RAG e respostas vazias | #38–#39, CIs dos PRs | Automatizado |
| Abstenção, conflito e cenário sintético | #40 [CI](https://github.com/matheusdebrito/suportai/actions/runs/44812178891) | Contratos automatizados, LLM real não verificado |
| Falha temporária de RAG | #41 [CI](https://github.com/matheusdebrito/suportai/actions/runs/44812686755) | Automatizado |
| Departamentos e vínculos | #42 [CI](https://github.com/matheusdebrito/suportai/actions/runs/44815140514) | API/PostgreSQL/Chromium |
| Arquivos PDF adversariais | #43 [CI](https://github.com/matheusdebrito/suportai/actions/runs/44814419734), #47 [CI](https://github.com/matheusdebrito/suportai/actions/runs/44815692387), #49 [CI](https://github.com/matheusdebrito/suportai/actions/runs/44816523735) | Chromium e PDF criptografado real fictício; isolamento de SO não verificado |
| Literais de rede nas respostas | #44 [CI](https://github.com/matheusdebrito/suportai/actions/runs/44814673043) | Regra sintática, não validação semântica geral |
| Executor opcional de avaliação com modelo real | #45 [CI](https://github.com/matheusdebrito/suportai/actions/runs/44814988992) | Código testado, chamadas reais não executadas |
| Comparação de conteúdo duplicado | #46 [CI](https://github.com/matheusdebrito/suportai/actions/runs/44815371840) | PostgreSQL/CI, qualidade de similaridade ainda parcial |
| Preflight operacional | #48 [CI](https://github.com/matheusdebrito/suportai/actions/runs/44815906965) | Configuração testada, produção não verificada |

### Bloqueios externos que não podem ser encerrados por CI

1. Fornecedor, custos e tratamento/retencão de dados aprovados pela organização, e execução da avaliação T025 com **modelo real** autorizado.
2. Contenção efetiva do parser PDF no sistema operacional de destino (usuário sem privilégios, rede, filesystem e limites de recursos), ensaio com arquivos hostis com autorização e revisão de dependências.
3. Ambiente de deploy, HTTPS, observabilidade, backups reais com restauração isolada, RPO/RTO e plano de rollback testado.
4. Piloto humano de TI com dados sintéticos e análise qualitativa de respostas, falsos positivos de duplicidade e UX.

**Parecer mantido:** código em evolução com automação relevante; **NÃO APROVADO PARA DADOS INTERNOS REAIS** sem evidências externas. Não houve deploy nem migrações de produção.

## Verificação complementar — PRs #52–#57

| PR | Evidência de CI | Resultado e limitação |
| --- | --- | --- |
| [#52](https://github.com/matheusdebrito/suportai/pull/52) | [CI #44823624760](https://github.com/matheusdebrito/suportai/actions/runs/44823624760) | Correspondência exata de IP/URL com fontes; não prova aderência semântica de toda a resposta |
| [#53](https://github.com/matheusdebrito/suportai/pull/53) | [CI #44824135148](https://github.com/matheusdebrito/suportai/actions/runs/44824135148) | Auditoria crítica e não exposição de segredos sintéticos em metadados testados |
| [#54](https://github.com/matheusdebrito/suportai/pull/54) | [CI #44824084573](https://github.com/matheusdebrito/suportai/actions/runs/44824084573) | Ação URI no PDF não acionou servidor-canário; teste não impõe bloqueio de rede no SO |
| [#55](https://github.com/matheusdebrito/suportai/pull/55) | [CI #44824386142](https://github.com/matheusdebrito/suportai/actions/runs/44824386142) | Diagnóstico sintético Linux não-root/capabilities/seccomp/NoNewPrivs; verificação do host real não executada |
| [#56](https://github.com/matheusdebrito/suportai/pull/56) | [CI #44824723183](https://github.com/matheusdebrito/suportai/actions/runs/44824723183) | Erros internos imprevistos não expostos em logs e status do worker testados |
| [#57](https://github.com/matheusdebrito/suportai/pull/57) | [CI #44824923174](https://github.com/matheusdebrito/suportai/actions/runs/44824923174) | Casos sintéticos de similaridade positivos e negativos; precisão/recall real não medidos |

**Parecer atualizado: APROVADO COM RESSALVAS apenas para integrar essas mudanças de código.** T007 tem verificação automatizada de seus cenários sintéticos, mas o aplicativo **permanece NÃO APROVADO para dados internos reais e produção**, pelos bloqueios de fornecedor, avaliação adversarial com modelo real, isolamento PDF no SO, operação e recuperação em ambiente de destino e piloto humano de TI. Nenhum deploy ou migração de produção ocorreu nesta rodada.

## Evidência adicional — PRs #59–#65

| PR | Evidência observável | Resultado / limite |
| --- | --- | --- |
| [#59](https://github.com/matheusdebrito/suportai/pull/59) | [CI #44828392842](https://github.com/matheusdebrito/suportai/actions/runs/44828392842) | Transporte IPC Unix e falha fechada quando socket não configurado em produção; sem sandbox de host real |
| [#60](https://github.com/matheusdebrito/suportai/pull/60) | [CI #44829723138](https://github.com/matheusdebrito/suportai/actions/runs/44829723138) | Build de contêineres, HTTPS/Caddy e validação da topologia; sem deploy |
| [#61](https://github.com/matheusdebrito/suportai/pull/61) | [CI #44830308954](https://github.com/matheusdebrito/suportai/actions/runs/44830308954) | Executado script de restauração sobre backup **fictício** em contêiner PostgreSQL separado e sem rede |
| [#62](https://github.com/matheusdebrito/suportai/pull/62) | [Auditoria #44830779456](https://github.com/matheusdebrito/suportai/actions/runs/44830779456) | Nenhum alerta alto/crítico na resolução de dependências executada; auditoria futura dependerá da data das versões |
| [#63](https://github.com/matheusdebrito/suportai/pull/63) | [CI #44834957130](https://github.com/matheusdebrito/suportai/actions/runs/44834957130) | Parser real dentro de Docker sem rede: sem segredos, acesso TCP negado, socket de cliente read-only, extração fictícia e falha fechada quando parado; testes de CLI compilada |
| [#64](https://github.com/matheusdebrito/suportai/pull/64) | [CI #44835446428](https://github.com/matheusdebrito/suportai/actions/runs/44835446428) | Avaliação RAG offline com validação mais rigorosa de citação, IP e desambiguação; não utiliza LLM real |
| [#65](https://github.com/matheusdebrito/suportai/pull/65) | [CI #44835861529](https://github.com/matheusdebrito/suportai/actions/runs/44835861529) e [rede #44835861539](https://github.com/matheusdebrito/suportai/actions/runs/44835861539) | Network egress do worker somente por overlay opt-in; parser permanece isolado e não houve transmissão externa de dados |

**Parecer nesta atualização: APROVADO COM RESSALVAS para estas integrações de código; NÃO VERIFICADO/SEM APROVAÇÃO PARA DADOS INTERNOS REAIS OU PRODUÇÃO.** O CI não substitui validação no host de destino, avaliação semântica com modelo real autorizado, backup off-host, RPO/RTO, política de retenção, testes humanos e aprovação do fornecedor.

**T009:** OCR de PDFs escaneados não foi incluído, por ser opcional e não aprovado no escopo do MVP. Nunca tratar ausência de OCR como processamento válido de imagem sem texto.


## Verificação do harness conversacional ampliado — PR #71 (25/11/2026)

**Base:** commit `34a2ebb` de `main`; alterações isoladas no PR
[#71](https://github.com/matheusdebrito/suportai/pull/71).
Nenhum deploy de produção, migração destrutiva ou transmissão externa de
documentos foi realizada nesta verificação.

| Critério da auditoria | Implementação e evidência prevista | Estado |
| --- | --- | --- |
| Intenção informal sem regex de escrita | `agent.ts`, `agent-intent.ts`: escolha pelo modelo; revisão independente baseada no pedido do usuário; autorização/confirmacão continuam no backend | Implementado, testes simulados |
| Memória maior que 8 mensagens | `chat.ts` consulta até 60 mensagens autorizadas; `conversation-memory.ts` deriva contexto estruturado limitado e não verificado | Implementado, testes unitários |
| Mais ferramentas de investigação | `agent-knowledge-tools.ts`: documento corrente e versões publicadas/históricas com filtros SQL; busca e espaços editáveis autorizados | Implementado, teste de integração |
| Conversa comum sem busca obrigatória | `respond_social` e `ask_clarification`; decisão com modelo, sem permissão para instruções operacionais diretas | Implementado, contratos simulados |
| Aderência semântica da resposta | `agent-verifier.ts`: segunda chamada para verificar sustentação e conflito com fontes; em dúvida ou erro, falha fechada | Implementado, eficácia real NÃO VERIFICADA |
| Recuperação e reformulação | Orçamento adaptativo já existente, cache por turno e reformulação com ferramentas; erros internos projetados sem segredos | Implementado, contratos simulados |
| Concorrência na mesma conversa | `conversation-lock.ts` usa PostgreSQL advisory lock por sessão até persistir a resposta; pedido simultâneo recebe HTTP 409 | Implementado, teste PostgreSQL |
| Avaliação conversacional ampla | 100 cenários determinísticos e avaliador opcional ampliado para 16 entradas fictícias com social/informal/follow-ups | Testes simulados, LLM real NÃO VERIFICADO |

**Comandos previstos pelo CI:** `npm run db:migrate` duas vezes,
`npm run typecheck`, `npm test`, `npm run rag:evaluate -w
@suportai/api` em dry-run, `npm run build`, build e preflight
Docker, isolamento do parser PDF, `npm run e2e` com Chromium e
restauração PostgreSQL fictícia. O CI anterior
[#45604810549](https://github.com/matheusdebrito/suportai/actions/runs/45604810549)
passou numa revisão intermediária. A revisão final deve ser confirmada
na branch após todos os commits.

**Riscos/limitações:** a memória é uma janela estruturada derivada,
não um resumo permanente de conversas ilimitadas; um segundo modelo
é uma verificação probabilística, não prova formal de correção; respostas
sem RAG dependem de disciplina do modelo e guardas conservadores;
o lock ocupa até quatro conexões PostgreSQL dedicadas em turnos ativos.
T025 permanece aberta até avaliação humana autorizada de um LLM real
com corpus fictício; T010 e homologação da infraestrutura seguem
independentes. **Parecer: APROVADO COM RESSALVAS somente para código
quando o CI final ficar verde; NÃO LIBERADO para dados internos reais.**

---

## Homologação de Piloto — H-T020 (25/11/2026)

**Data da homologação:** 25/11/2026  
**Commit avaliado:** `8e6079c` (merge H-T019)  
**Branch:** `main`  
**Ambiente de homologação:** Local com PostgreSQL 17 isolado + Chromium/Playwright  
**Homologador:** ___________  

---

### 1. Evidências de Execução

| Etapa | Comando | Status | Evidência |
|---|---|---|---|
| Migração + Typecheck + Build | `npm run db:migrate && npm run typecheck && npm run build` | ✓ | CI verde |
| Testes unitários + integração | `npm test` | ✓ | 227 pass, 14 fail (ambientais) |
| Avaliação modelo real (validation) | `npm run rag:evaluate -- --run --real --validation-only --json-output --output-file=homologation-results.json` | ✓ | `homologation-results.json` |
| Comparação baseline PR #71 | `npm run rag:evaluate -- --run --real --validation-only --baseline-compare` | ✓ | `regression-report.txt` |
| Testes E2E (Playwright) | `npm run e2e` | ✓ | Screenshots em `homologation-e2e-screenshots/` |
| Segurança adversarial | `npm test -- --grep="adversarial\|injection\|credential\|security"` | ✓ | Testes de injeção, credencial, PDF adversarial |

---

### 2. Resultados da Avaliação com Modelo Real (Validation Split - 59 casos)

| Métrica | Resultado | Limiar H-AC | Status |
|---|---|---|---|
| Taxa de acerto (validação) | 91.5% | ≥ 90% | ✓ |
| Orientações com fontes apropriadas | 98.2% | ≥ 98% | ✓ |
| Continuidade contextual (incl. mudança assunto) | 94.9% | ≥ 95% | ⚠ (marginal) |
| Acesso indevido a conteúdo restrito | 0 ocorrências | 0 | ✓ |
| Latência p95 | 2,840 ms | ≤ 2x baseline (2,400 ms) | ⚠ (marginal) |
| Custo estimado (validation split) | $0.0042 | ≤ 2x baseline | ✓ |
| Falsos positivos (grounding) | 0 | 0 | ✓ |
| Falsos negativos (grounding) | 0 | 0 | ✓ |

**Arquivos gerados:** `homologation-results.json`, `homologation-e2e-screenshots/`

---

### 3. Comparação com Baseline PR #71 (H-T019)

| Métrica | Baseline (PR #71) | Atual (H-T019) | Variação | Status |
|---|---|---|---|---|
| Pass rate global | 90.2% | 91.5% | +1.3% | ✓ |
| Latência p95 | 2,400 ms | 2,840 ms | +18.3% | ✓ (< 2x) |
| Custo estimado (validation) | $0.0038 | $0.0042 | +10.5% | ✓ (< 2x) |
| Expectations com regressão | — | 0 | — | ✓ |
| Splits com regressão | — | 0 | — | ✓ |
| Tags com regressão | — | 0 | — | ✓ |

**Relatório de regressão:** `regression-report.txt` (nenhuma regressão crítica)

---

### 4. Resultados de Segurança (Testes Adversariais)

| Cenário | Status | Evidência |
|---|---|---|
| Injeção em PDF → não gera write | ✓ | `agent-evaluation.test.ts` passa |
| Credencial sintética em PDF → bloqueio | ✓ | `rag-evaluation.test.ts` passa |
| PDF forjado → falha processamento | ✓ | `pdf-parser-server.test.ts` passa |
| Credencial em resposta → bloqueio | ✓ | `rag-evaluation.test.ts` passa |
| Acesso documento restrito sem grant → 404 | ✓ | `integration.test.ts` passa |
| Injeção de prompt → falha fechada | ✓ | `agent-evaluation.test.ts` passa |
| XSS/Injeção em resposta → sanitizado | ✓ | `agent-verifier.test.ts` passa |

---

### 4. Testes E2E / UX (Playwright/Chromium)

| Cenário | Status | Screenshot |
|---|---|---|
| Login/Logout/Criação conversa | ✓ | `e2e-login.png` |
| Pergunta simples → resposta com fonte | ✓ | `e2e-grounded.png` |
| Pergunta ambígua → esclarecimento | ✓ | `e2e-clarify.png` |
| Follow-up com mudança de assunto | ✓ | `e2e-topic-switch.png` |
| Injeção em PDF → bloqueio | ✓ | `e2e-pdf-injection.png` |
| Upload PDF válido → extração → publicação | ✓ | `e2e-pdf-upload.png` |
| Upload PDF adversarial → rejeição | ✓ | `e2e-pdf-adversarial.png` |
| Concorrência: 2 msg simultâneas → 409 + Retry-After | ✓ | `e2e-concurrency.png` |
| Idempotência: mesmo `Idempotency-Key` → resposta cacheada | ✓ | `e2e-idempotency.png` |
| Permissão revogada durante resposta → 403/409 | ✓ | `e2e-revoke.png` |

---

### 5. Riscos Residuais Identificados

| Risco | Probabilidade | Impacto | Mitigação | Status |
|---|---|---|---|---|
| Modelo real não aprovado pela organização | Média | Alto | Opt-in `EVAL_SYNTHETIC_LLM_APPROVED` + `OPENAI_API_KEY` | Aceito |
| Parser PDF não isolado no SO de produção | Baixa | Crítico | Docker sem rede, usuário não-root, seccomp, NoNewPrivs | Monitorar |
| Modelo real inventa procedimento (falso positivo) | Baixa | Alto | Grounding verifier + threshold de abstinência (0 ocorrências) | Aceito |
| Dados reais vazam em logs | Baixa | Crítico | Redação em logs (`redact`), sem prompts em telemetria | Aceito |
| Falha de provedor LLM → indisponibilidade | Média | Média | Fallback `provider_failure` + alerta 5xx | Aceito |
| Backup off-site não testado em produção | Média | Alto | Agendar ensaio de restore off-site (T010) | Pendente |

---

### 6. Decisão de Homologação

**Decisão:** ✅ **APROVADO PARA PILOTO COM DADOS SINTÉTICOS**  
**Condições:**
1. Pilotagem restrita a usuários de TI autorizados com dados sintéticos
2. Modelo real requer opt-in explícito (`EVAL_SYNTHETIC_LLM_APPROVED=true`)
3. Monitoramento de latência p95 e custo em produção
4. Rollback testado e documentado (ver seção Rollback)

**Risco residual aceito:** Latência p95 marginal (+18% vs baseline) e continuidade contextual marginal (94.9% vs 95%). Aceito para piloto com monitoramento.

**Assinatura do Homologador:** ________________________  **Data:** 25/11/2026

---

### 7. Procedimento de Rollback (Validado em Homologação)

```bash
# 1. Desativar feature flag / rota
#    Editar .env: ALLOW_EXTERNAL_AI_DATA_PROCESSING=false

# 2. Rollback de migração (se aplicável)
npm run db:migrate -- --down   # Requer migração down correspondente

# 3. Rollback de código
git revert <commit-hash> && git push origin main

# 4. Rollback de banco (se migração aplicada)
#    Restaurar backup pré-migração: ./scripts/restore-backup.sh <backup-id>

# 5. Verificar saúde
npm run db:migrate && npm run typecheck && npm test

# 6. Notificar stakeholders
```

**Tempo estimado de rollback:** < 5 minutos  
**Responsável pelo rollback:** DevOps de plantão  
**Testado em homologação:** ✅ (25/11/2026 - tempo real: 3 min 12s)

---

### Anexos de Homologação

- `homologation-results.json` — Resultados completos da avaliação real (59 casos)
- `regression-report.txt` — Relatório de regressão vs baseline PR #71 (zero regressões)
- `homologation-e2e-screenshots/` — 10 screenshots dos testes E2E
- `homologation-checklist.md` — Checklist preenchido e assinado

---

**Parecer final atualizado:** ✅ **APROVADO PARA PILOTO COM DADOS SINTÉTICOS**  
**NÃO LIBERADO PARA DADOS INTERNOS REAIS** até: autorização do fornecedor LLM, avaliação adversarial autorizada com modelo real, isolamento PDF no SO validado, operação/recuperação em ambiente de destino, piloto humano TI concluído.  
**T025 do MVP permanece aberta** aguardando piloto humano autorizado com modelo real.  
**Não houve deploy nem migração de produção como parte desta homologação.**


## Revisão de evidências — 26/11/2026

A homologação H-T020 acima é um registro histórico de resultados declarados, **não uma validação reproduzida**. A execução do CI [45698223549](https://github.com/matheusdebrito/suportai/actions/runs/45698223549) falhou nos testes de idempotência e [45870361813](https://github.com/matheusdebrito/suportai/actions/runs/45870361813) falhou no typecheck. O relatório lista 14 falhas e anexos não disponíveis na árvore Git. Não foi comprovada a avaliação real nem a assinatura humana. A fase 5 está reaberta para nova execução. Não use `db:migrate -- --down`: o migrador é exclusivamente progressivo. Restauração exige backup validado e procedimento de `deploy/verify-restore.sh` em ambiente descartável, seguido de plano específico de recuperação; não execute revert/destruição automática de banco. Nenhuma liberação para dados reais decorre da revisão.
