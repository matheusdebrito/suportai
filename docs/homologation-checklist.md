# Checklist de Homologação de Piloto — SuportAI

**Data:** ___________  
**Responsável:** ___________  
**Versão avaliada:** ___________ (commit: ___________)  
**Ambiente:** ___________ (local / staging / staging-isolado)

---

## 1. Critérios de Aceitação Funcionais (Automatizados)

| Critério | Evidência | Status (✓/✗/N/A) | Observações |
|---|---|---|---|
| AC-001 | Integração PostgreSQL: autenticação, sessão, consultas | | |
| AC-002 | Grants de espaços (shared/restricted) sem multitenant | | |
| AC-003 | Busca RAG bloqueia restrito e expõe permitido | | |
| AC-004 | Modelo simulado atrasado, revogação concorrente, bloqueio | | |
| AC-005 | Saudação e recuperação de histórico pela API | | |
| AC-006 | Fonte, versão histórica e exclusão de rascunho | | |
| AC-007 | Resposta sem evidência = sem procedimento; contradição entre fontes | | |
| AC-008 | Criação de artigo em rascunho, autoria, controle de espaço | | |
| AC-009 | Upload PDF, extração por worker, rejeição inválido | | |
| AC-010 | Modelo prepara prévia, confirmação gera rascunho, não publica | | |
| AC-011 | Nova versão preserva publicada; comparação frontend | | |
| AC-012 | Duplicidade backend + banner UI | | |
| AC-013 | Permissão aprovador, negação admin sem papel, pareceres | | |
| AC-014 | Publicação humana, arquivo histórico, ajuste/correção | | |
| AC-015 | Detecção segredos, restrições ferramenta/acesso | | |
| AC-016 | Eventos auditados para concessões, publicação, correções, feedback | | |
| AC-017 | Feedback mensagem correta, concorrência, UI reload | | |
| AC-018 | Falha ingestão, retry, lease, publicação idempotente | | |
| AC-019 | Login, logout revoga sessão, teste Chromium reload | | |
| AC-020 | Permissões restritas concedidas/revogadas por admin | | |
| AC-021 | Esquema e app preparados para piloto TI | | |
| AC-022 | Autor aprovador publica próprio artigo | | |
| AC-023 | Admin usuários/papéis, negação colaborador, invalidação sessões | | |
| AC-024 | Isolamento documentos restritos, concessão/revogação RAG | | |
| AC-025 | Código temporário uso único, troca senha, ativação real | | |

---

## 2. Avaliação com Modelo Real (H-T018)

| Métrica | Resultado | Limiar | Status |
|---|---|---|---|
| Taxa de acerto (validação) | ___% | ≥ 90% | |
| Orientações com fontes apropriadas | ___% | ≥ 98% | |
| Continuidade contextual (incl. mudança assunto) | ___% | ≥ 95% | |
| Acesso indevido a conteúdo restrito | ___ ocorrências | 0 | |
| Latência p95 | ___ ms | ≤ 2x baseline | |
| Custo estimado | $___ | ≤ 2x baseline | |
| Falsos positivos (grounding) | ___ | 0 | |
| Falsos negativos (grounding) | ___ | 0 | |

**Arquivo de resultados:** `homologation-results.json`  
**Commit avaliado:** ___________

---

## 3. Comparação com Baseline PR #71 (H-T019)

| Métrica | Baseline (PR #71) | Atual | Variação | Status |
|---|---|---|---|---|
| Pass rate global | ___% | ___% | ___% | ✓/⚠/✗ |
| Latência p95 | ___ ms | ___ ms | ___% | ✓/⚠/✗ |
| Custo estimado | $___ | $___ | ___% | ✓/⚠/✗ |
| Expectations com regressão | — | ___ | — | ✓/⚠/✗ |
| Splits com regressão | — | ___ | — | ✓/⚠/✗ |
| Tags com regressão | — | ___ | — | ✓/⚠/✗ |

**Arquivo de regressão:** `regression-report.txt` (via `--baseline-compare`)

---

## 4. Testes E2E / UX (Playwright/Chromium)

| Cenário | Status | Evidência (screenshot/log) |
|---|---|---|
| Login/Logout/Criação conversa | ✓/✗ | |
| Pergunta simples → resposta com fonte | | |
| Pergunta ambígua → esclarecimento | | |
| Follow-up com mudança de assunto | | |
| Injeção em PDF → bloqueio | | |
| Upload PDF válido → extração → publicação | | |
| Upload PDF adversarial → rejeição | | |
| Concorrência: 2 mensagens simultâneas → 409 + Retry-After | | |
| Idempotência: mesmo `Idempotency-Key` → resposta cacheada | | |
| Permissão revogada durante resposta → 403/409 | | |

---

## 5. Segurança e Adversarial

| Teste | Status | Evidência |
|---|---|---|
| Injeção em PDF → não gera write | | |
| Credencial sintética em PDF → bloqueio | | |
| PDF forjado → falha processamento | | |
| Credencial em resposta → bloqueio | | |
| Acesso documento restrito sem grant → 404 | | |
| Injeção de prompt → falha fechada | | |
| XSS/Injeção em resposta → sanitizado | | |

---

## 6. Observabilidade e Operação

| Item | Status | Evidência |
|---|---|---|
| `/admin/telemetry` retorna p50/p95/p99 | | |
| Logs estruturados sem PII/prompts | | |
| Correlação `X-Request-Id` end-to-end | | |
| Alertas de erro configurados | | |
| Backup + restore fictício testado | | |

---

## 7. Riscos Residuais

| Risco | Probabilidade | Impacto | Mitigação | Aceite (✓/✗) |
|---|---|---|---|---|
| Modelo real não aprovado pela organização | | | Opt-in `EVAL_SYNTHETIC_LLM_APPROVED` | |
| Parser PDF não isolado no SO de produção | | | Docker sem rede, usuário não-root, seccomp | |
| Modelo real inventa procedimento (falso positivo) | | | Grounding verifier + threshold de abstinência | |
| Dados reais vazam em logs | | | Redação em logs (`redact`), sem prompts em telemetria | |
| Falha de provedor LLM → indisponibilidade | | | Fallback `provider_failure` + alerta | |
| Backup off-site não testado em produção | | | Agendar ensaio de restore off-site | |

---

## 8. Decisão de Homologação

- [ ] **APROVADO PARA PILOTO COM DADOS SINTÉTICOS** — Prosseguir com piloto humano TI
- [ ] **APROVADO COM RESSALVAS** — Condições: ________________________________
- [ ] **REPROVADO** — Motivos: _______________________________________________

**Decisão final:** ☐ APROVADO  ☐ APROVADO COM RESSALVAS  ☐ REPROVADO

**Assinatura do Homologador:** ________________________  **Data:** ___________

---

## 9. Procedimento de Rollback

Em caso de problema crítico em produção:

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

**Tempo estimado de rollback:** ___ minutos  
**Responsável pelo rollback:** ___________  
**Testado em:** ___________

---

## 10. Assinaturas Finais

| Papel | Nome | Assinatura | Data |
|---|---|---|---|
| Desenvolvedor | | | |
| QA / Homologador | | | |
| Aprovador / Gestor | | | |
| Segurança / DPO (se aplicável) | | | |

---

## Anexos

- `homologation-results.json` — Resultados completos da avaliação real
- `regression-report.txt` — Relatório de regressão vs baseline PR #71
- `homologation-e2e-screenshots/` — Screenshots dos testes E2E
- `verification.md` — Atualizado com esta homologação