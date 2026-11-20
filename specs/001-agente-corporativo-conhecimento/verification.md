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
