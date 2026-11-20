# Tarefas — SuportAI MVP

**Status:** implementação incremental na `main`; não considerar o MVP pronto enquanto houver critérios sem validação prática.

- [ ] T001 [REQ-001, REQ-027, REQ-029; AC-001, AC-023, AC-025] Validar login, bootstrap de admin, criação de usuários, reset de senha e revogação com PostgreSQL real; comandos: npm run db:migrate, npm run test.
- [ ] T002 [REQ-003, REQ-004, REQ-021, REQ-028; AC-002, AC-003, AC-024] Testar leitura restrita por API e RAG com usuários/grants independentes, incluindo revogação durante chamadas ao LLM.
- [ ] T003 [REQ-011, REQ-012, REQ-013; AC-008, AC-009] Validar artigos, PDFs, extração em worker, limites de payload e falhas de indexação.
- [ ] T004 [REQ-006..REQ-010; AC-005..AC-007] Validar conversação, tool calling, citações ancoradas, respostas sem evidência e perguntas de esclarecimento.
- [ ] T005 [REQ-014..REQ-021; AC-010..AC-014, AC-022] Validar prévia, confirmação, proteção contra duplicidade, revisão, autoaprovação permitida e publicação atômica.
- [ ] T006 [REQ-005, REQ-023; AC-004, AC-015] Testar prompt injection em PDFs e memória após revogação, incluindo mensagens em trânsito.
- [ ] T007 [REQ-022, REQ-024..REQ-026; AC-015..AC-018] Testar detecção de segredos, feedback, auditoria, reintentos, falhas controladas e recuperação.
- [ ] T008 [REQ-001..REQ-029] Executar typecheck, testes, instalação limpa, CI, revisão de segurança e teste de restauração de backup antes de produção.
- [ ] T009 [REQ-012] Decidir necessidade de OCR de PDFs escaneados; sem OCR no primeiro incremento.
- [ ] T010 [REQ-008, REQ-022] Aprovar provedores e política de processamento de dados reais antes de disponibilizar material interno.

## Critérios de encerramento

Concluir somente após execução real com banco, API, worker e UI, além de revisão de controle de acesso, vazamento de dados, fallback de LLM e idempotência. O PR não representa deploy aprovado.

- [x] T011 [REQ-006, REQ-010, AC-005] Recuperar conversas anteriores e propostas pendentes com isolamento por usuário; API validada em teste de integração com PostgreSQL.
- [x] T012 [REQ-014..REQ-021, AC-010..AC-014] Consultar rascunhos próprios e suas revisões, ocultando conteúdo de terceiros; API validada por teste de integração.
- [ ] T013 [REQ-006, REQ-014..REQ-021] Validar manualmente a interface de histórico, rascunhos e atualização de artigos no navegador (typecheck/build não equivalem a E2E).
- [ ] T014 [REQ-006..REQ-010] Validar escolha de espaço pelo modelo real em pedidos ambíguos, sem IDs fornecidos pelo usuário.

- [x] T015 [REQ-018, REQ-020, AC-013, AC-014] Aprovador solicita ajustes/rejeita com parecer; autor cria nova versão de artigo sem sobrescrever a anterior; autorização e concorrência validadas em integração PostgreSQL.
- [x] T016 [REQ-012, REQ-018, REQ-020; AC-014] Reenvio de PDF com ajustes, mantendo o documento e criando nova versão; permissões, concorrência, worker e publicação verificados com PostgreSQL real.
- [ ] T017 [REQ-015, AC-011] Verificar visualmente a comparação antes/depois nas interfaces de edição e revisão.

- [x] T018 [REQ-016, AC-012] Identificação de artigos publicados semelhantes no mesmo espaço antes da criação por painel ou conversa; prosseguir exige justificativa e gera evento auditável. Testado com PostgreSQL.
- [x] T019 [REQ-016, AC-012] Fluxo de duplicidade e abertura do artigo existente verificado com Chromium, no E2E editorial.

- [ ] T020 [REQ-012, REQ-020] Validar no navegador o envio de PDF corrigido e revisão de documento publicado, incluindo arquivos protegidos, sem texto e maiores que o limite.

- [x] T021 [REQ-025] Avaliação útil/não útil da resposta do agente com comentário opcional no chat, vinculada à mensagem e fontes; isolamento por usuário, autorização vigente e concorrência validados em integração PostgreSQL.
- [x] T022 [REQ-025, AC-017] Fluxo de feedback útil/não útil validado em Chromium com persistência após reload; qualidade real do RAG permanece pendente em T025.

- [x] T023 [REQ-001, REQ-006, REQ-011, REQ-025] E2E Chromium em CI verde: login, cadastro, ativação por token, rascunho, conversa, feedback, reload e logout.

- [x] T024 [REQ-017, REQ-018, REQ-019, AC-013, AC-022] Chromium validou autoaprovação autorizada, publicação de artigo, detecção de duplicidade e publicação de PDF com worker real.
- [ ] T025 [REQ-007..REQ-010; AC-005..AC-007] Avaliação com modelo real e documentos fictícios: referências conversacionais, conflitos, abstenção e tentativas de prompt injection; depende de provedor autorizado e ambiente controlado.
- [ ] T026 [REQ-016; AC-012] Evoluir similaridade além de títulos quando existirem dados sintéticos/curados suficientes para avaliar falsos positivos e omissões.
- [ ] T027 [REQ-026; AC-018] Ensaio de backup e restauração em banco vazio, rollback e verificação operacional antes da liberação real.
- [ ] T028 [REQ-012, REQ-022, AC-009, AC-015] Testes adicionais com PDFs maliciosos, protegidos e malformados em isolamento; não confundir processo-filho com sandbox de sistema operacional.
