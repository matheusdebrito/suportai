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
