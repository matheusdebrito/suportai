# PR 84 — implementation progress

Source of truth: melhorias.md. No merge authorized. Code first, execution of tests last.

## Missão de validação final — checkpoint atual

- **Etapa atual:** 2 de 6 — ampliar e congelar o corpus de calibração do RAG.
- **Etapa 1:** concluída em 27/11/2026 no HEAD `7818cc2ad93c06e957a4f99315518ac759c687d4`, com resultado reprovado e causa-raiz reproduzida.
- **Banco:** PostgreSQL 17/pgvector descartável exclusivo, em porta separada. `DATABASE_URL` e `TEST_DATABASE_URL` eram idênticas. Migrações 001–010 aplicaram na primeira execução e ficaram inalteradas na segunda.
- **Avaliação real:** os três testes opt-in foram executados, sem skips, com `gpt-4.1-mini`, `text-embedding-3-small`, temperatura `0.2`, fixtures sintéticas e processamento externo explicitamente habilitado somente para a rodada. Resultado do arquivo: 10 testes, 8 aprovados e 2 reprovados.
- **Cobertura efetiva:** quatro casos de calibração, episódio histórico de telefone com cinco turnos e matriz ampliada com nove episódios/26 turnos, totalizando os 10 episódios/31 turnos esperados.
- **Falha principal:** o `semantic_turn_v1` aceitou estruturalmente combinações que o prompt proibia apenas em linguagem natural. Em reproduções reais, o modelo devolveu `topic` para `route=existing`, herdou `equipment` fora da mensagem atual e classificou pedidos de continuidade/modo com campos incompatíveis. `parseSemanticTurn` rejeitou essas respostas e a rota HTTP caiu em `provider_failure`, interrompendo contexto, recuperação e captura do agente.
- **Impacto medido:** o corpus de recuperação isolado encontrou os quatro documentos esperados; a matriz conversacional registrou 55 checks falhos, sobretudo perda/troca de investigação, fonte ausente e captura ausente após rejeição do intérprete. O episódio de telefone falhou no segundo turno. Isso aponta primeiro para interpretação/contrato e, como efeitos, contexto e harness; não há evidência para atribuir a falha primária ao RAG.
- **Falhas secundárias observadas:** `claim_shape`, `invalid_question` e `invalid_reference` no verificador em alguns primeiros turnos válidos; serão analisadas após o corpus e o baseline serem congelados, conforme a ordem obrigatória.
- **Limitação do harness:** o relatório do telefone só é escrito depois de todos os turnos; a asserção no segundo turno impediu o artefato parcial. A matriz ampliada foi preservada e contém respostas e métricas dos 26 turnos.
- **Evidências novas:** `docs/validation-pr-84-evidence/2026-11-27-head-7818cc2/`. Os artefatos históricos permaneceram intactos.
- **CI remoto do HEAD inicial:** `validate` e `audit` aprovados nas execuções 46032632050 e 46032632043. CI verde determinístico não substitui a avaliação real reprovada.
- **Próximo passo:** criar pelo menos 100 casos positivos (60% piloto/40% holdout sem famílias vazando entre divisões) e uma suíte separada de segurança/abstenção. Depois estabelecer o baseline ampliado antes de corrigir o contrato semântico.

| Requirement | State | Evidence / next action |
|---|---|---|
| Active investigation and short follow-ups | Implemented and validated | One investigation ID remained stable across five real turns; `sim` advanced to the next documented stage |
| Structured contextual lookup | Implemented and validated | Real short follow-up retained the phone topic; focused and long-history regressions pass |
| Persist support mode | Implemented and validated | Migration 010 applied and was idempotent; real episode changed `guided` to `complete` only on explicit request |
| Unified response contract and operational credentials | Implemented and validated | Exact authorized `admin` value was returned with a current source; focused fallback rejects historical, conflicting, hostile and secret-bearing inputs |
| Nonclaim vs unsupported | Implemented and validated | Sparse verifier output may infer only narrow framing/progress questions; missing factual units fail closed |
| Procedural dependencies | Implemented and validated | Incomplete numbered procedures are rejected; complete fallback preserves the four documented stages |
| False blocks and naturalness | Implemented, AI-reviewed | Five-turn review found zero false acceptances/rejections, degraded fallbacks, repeated questions or unnecessary warnings; human review remains pending |
| Structural chunks | Implemented and regression-tested | Lossless structural chunk coverage and bounds are covered by the API suite; production content was not reindexed |
| Adjacent retrieval | Implemented and regression-tested | Neighbor ordering, same-version constraint and authorization filtering are covered by retrieval tests |
| Complete document | Implemented and validated | Explicit complete request retrieved the authorized current document and produced all four steps |
| Calibration | Implemented, limited corpus | Two pilot and two holdout synthetic cases scored recall/precision/MRR 1.0; no threshold was changed because the corpus is small and not human-reviewed |
| Real HTTP episodes | Implemented and validated | Both opt-in tests ran with real chat and embedding models; 8/8 tests passed |
| Effective metadata | Implemented and validated | Episode/baseline record model, embedding model, temperature, limits, corpus hash and evaluated commit |
| Reproducible baseline | Implemented, human label pending | Baseline generated from five AI-reviewed turns with `criteriaMet: true`; it explicitly retains `humanReview: pending` |
| Documentation counts | Validated | Grounding dry-run lists 15 cases; calibration has 4 cases; real episode has 5 turns |
| Final verification | Complete | Typecheck and build pass. Official Windows suite: 292 tests, 279 pass, 11 platform-only infrastructure failures, 2 opt-in skips. Linux CI run 45998382347 passed; human conversational review remains pending |

## Resume point
Next: inspect verifier function signature and procedure rejection, wire episode-review into a report CLI, capture verifier outcomes without exposing production data, complete calibration and baseline metadata. Review all previous commits for type and SQL errors before validation. No tests executed in this round. No production migration or reindex performed. Real model evaluation requires isolated database and explicit external processing authorization.

## Latest checkpoint
Episode reports now capture returned agent metrics, assert stable investigation identity and require evidence on the password and complete-procedure turns. Neighbor chunks are ordered within their version. Calibration CLI import side effects guarded and policy input validated. Next: inspect compile/schema compatibility, complete candidate capture and lexical calibration, add regression tests and baseline workflow. All changes remain unverified.

## Latest checkpoint: calibration and baseline
Added lexical coverage threshold to offline reranking (default zero preserves existing behavior), isolated synthetic lexical candidate capture, and reviewed real-episode baseline generator. Semantic candidate capture and end-to-end SQL threshold calibration remain pending; no experimental baseline has been generated. Next: wire capture into fixture runner, add regression tests, review compile/schema compatibility, then execute validation.

## Latest checkpoint
Semantic capture integrated into the opt-in real HTTP fixture, with real fixture embeddings and explicit authorization. Added regression tests for reviewed metrics and baseline. The two queries share a single synthetic document: smoke coverage only, not an independent reviewed pilot/holdout corpus. Next: review full diff for compile and schema compatibility, expand independent corpus and execute validation. No tests run yet.

## Latest checkpoint
Separated calibration from phone episode; four independent synthetic documents across pilot and holdout, with real embeddings. Added npm commands for calibration, review and baseline. Corpus is still small and not human-reviewed. Next: static integration review, build/typecheck and regression execution; expand reviewed pilot before changing thresholds.

## CI review
CI run 45907280551 failed typecheck TS7034/TS7005 in episode turns; explicit report type added. Production dependency audit passed on 3482dc8. Await new CI; remaining integration review and real evaluation pending.

## Regression fixes
CI 45907703215 passed typecheck, failed five tests. Restore contextual technical lookup and bounded brand/model answers; retain independent supported prose while rejecting incomplete lists; benchmark uses explicit nonclaim; complete fallback fixture explicitly represents full document rather than a chunk. New CI required; real evaluation still pending.

## CI regression checkpoint
Run 45992856019 on f166740: 285 tests, 282 passed, one failed, two skipped. Typecheck and production dependency audit passed. Four of five previous regressions resolved. Remaining benchmark fixture `phone-fields` incorrectly classified its equipment applicability heading as nonclaim; server correctly treated it as unsupported and rejected removal from a numbered procedure. Corrected fixture to cite exact evidence for scope, clarified verifier prompt, added focused scope-preservation regression and per-case failure diagnostics. No expected benchmark rates lowered. Next: confirm new CI, inspect any remaining failures, run authorized real evaluation and review remaining checklist. No merge.

## Local validation round — 2026-11-27

Evaluated code commit `036f2fa7f64ce1204ccdd5af0a3042d1d55554a6` from initial PR head `a9dcc890be060a3e87bb0f6ea119f64deb8c809f`. The isolated PostgreSQL 17/pgvector database contained only synthetic fixtures; migrations 001–010 applied once and were unchanged on the second run. External processing was enabled only for the opt-in synthetic evaluation.

The real HTTP evaluation ran both required cases without skips using `gpt-4.1-mini` and `text-embedding-3-small`: 8 tests passed. The five-turn phone episode retained one investigation, progressed after `sim`, answered the password question directly from the current authorized source, avoided repeated questions and returned the complete four-step procedure when requested. AI review over five turns recorded continuity 1 and zero false acceptances, false rejections, degraded fallbacks, unnecessary warnings, repeated questions, unauthorized sources, secret leaks, indirect answers, inappropriate steps and incomplete procedures. These labels are not human labels; human review remains pending.

Calibration used two independent synthetic pilot cases and two holdout cases. Baseline and selected policies both obtained recall, precision and MRR 1.0 on this small corpus, so no production threshold was changed. Semantic/lexical candidate coverage was exercised, but per-candidate score distributions were not persisted and the corpus is not large or human-reviewed enough to justify tuning.

Problems found and corrected:

- sparse verifier claim arrays incorrectly caused `claim_shape`; inference is now limited to safe framing and progress questions, while factual omissions fail closed;
- short confirmations searched only for `sim`; lookup now carries the structured investigation topic;
- guided and complete modes could lose their output contract; bounded rewrites and mode-specific grounded fallbacks now enforce progression versus full procedure;
- focused technical requests could use `respond_social` without evidence; that path is blocked and exact focused answers require one current authorized version;
- guided recovery repeated an already completed stage; it now selects the next unseen documented stage;
- unsupported partial procedures and complete answers ending in a progress question are rejected.

Focused regression tests pass, as do typecheck and the API/web production build. The official full suite on Windows reported 292 tests: 279 passed, 11 failed and 2 skipped. All 11 failures are confined to three Bash operational-script checks and eight Unix-domain-socket PDF parser checks, which cannot execute on this Windows host; the repository instructions assign those checks to Linux CI. No functional, database, authorization or grounding regression failed in that run. The two skips are the expected real-model tests when the general suite runs without opt-in; they passed separately in the authorized run.

Detailed commands, outputs, responses, metrics and limitations are recorded in `docs/validation-pr-84.md`; machine-readable synthetic evidence is under `docs/validation-pr-84-evidence/`. Linux CI run 45998382347 passed for the published correction and evidence commit. Human review of the conversational labels remains pending. No merge was performed.

## Structured Outputs checkpoint
PR head 78bf151 CI and dependency audit passed. Migrated verifier to versioned strict JSON schema with backend exact-key and enum checks, explicit refusal/incompatibility/schema failure codes, and updated mocks and contract regressions. No downgrade to free JSON. Pending CI and real-model comparison. Next: deterministic fallback safety, harness telemetry, expanded episodes, then evaluation. No merge.

## Deterministic recovery checkpoint
Fallback is now attempted for generation transport failures, interruption, refusal and exhausted model budgets only when existing authorized evidence permits it. Counts and reason codes are captured without raw content. Guided advancement requires explicit confirmation and preserves stage headings and conditions; focused recovery rejects ambiguity, personal values and mismatched subjects. Complete fallback requires a non-truncated document. Added regression tests. CI and real evaluation pending. Next: harness telemetry and expanded scenarios.

## Harness telemetry checkpoint
Test-only agentResponder wrapper now captures real agent metrics, actual retrieval rankings and verifier candidate/outcome/timing/usage per turn. Production HTTP response unchanged. The phone episode asserts capture exists. Previous baseline remains unchanged and lacks per-turn telemetry; no fabricated historical values. Next: expand synthetic episodes, compare comparable baseline fields, verify CI and execute real evaluation where explicitly authorized.

## Expanded episode checkpoint
CI on 191308a failed one regression: heading-based prose without bullets could no longer recover a guided first stage. Restored section-aware unmarked prose while rejecting ambiguous interleaved conditions. Added five opt-in real HTTP episodes (18 turns) for negative progression, RIS/ERP switch and resume, scanner focus/mode, revocation and restricted knowledge; fixture-only retrieval checks and chunk ranking metrics. Previous phone baseline unchanged. Pending new CI, actual real execution and human review.

## Real evaluation and baseline comparison checkpoint
Added matched-report comparison with explicit unavailable historical telemetry and optional same-origin reviewed labels. Historical report and baseline remain intact. Tightened markdown scope preservation and offline deterministic recovery; negative confirmations preserve the active topic. Expanded episode runner reports independent failures. CI of strict-schema commit a8eed2d passed; intermediate CI 191308a/b921b30 failed one heading-based fallback regression corrected in d1fdb78. Final CI must confirm all changes. Real evaluation is blocked in the chat execution environment: no authorized OpenAI API key, PostgreSQL test database, Docker or direct GitHub network. Run the documented opt-in local command at final HEAD, compare original phone reports, review expanded turns, record actual metrics and resolve failures. No new real measurements are claimed. No merge.

## E2E compatibility correction
CI 46005023830 at 90c8b43: typecheck, 304 deterministic tests (3 real-model skips), RAG evaluation, build and runtime checks passed. Playwright failed one of three tests because the offline empty-result response no longer retained the explicit no-evidence message required by the browser flow; it was not a retrieval or authorization failure. Restored the no-evidence response only for an empty result, kept the conservative deterministic fallback for nonempty results, and added focused tests for both empty and unrelated evidence. No E2E assertions or security checks weakened. New CI pending; real-model comparison still pending.

## Regressão de artigo curto — flexões e evidência parcial

Relato de atendimento: pergunta de geração de voucher Wi-Fi encontrou documentos, mas terminou em abstenção genérica. Inspeção do código revelou incompatibilidade concreta no fallback: flexões curtas como `gero`/`gerar` não satisfaziam o prefixo mínimo de sete caracteres. O trecho relatado contém campos de acesso, não os passos da operação. Foram adicionadas famílias morfológicas fechadas, sem equiparar gerar a revogar/gerenciar, normalização Wi-Fi e resposta parcial determinística para fichas de acesso inequívocas. O fallback não inventa etapas, não rotula a ficha como procedimento completo e cita somente o endereço documentado, sem reproduzir credenciais não qualificadas. Consulta focada por IP também não devolve a linha com login/senha. Fixtures de teste são exclusivamente sintéticas; dados e credenciais do relato real não foram incluídos no repositório. Adicionadas regressões unitárias e de fluxo completo com verificador simulado. Causa exata do veredito em produção ainda depende de telemetria e identificação do commit implantado. CI e avaliação real do novo caso pendentes. Manter F1–F6 e o baseline histórico; não alterar limiares, não fazer merge nem publicar/reindexar conhecimento real automaticamente.

## Decisão semântica de conhecimento pelo LLM

A seleção do conhecimento passa a ser uma decisão explícita do modelo, por `select_knowledge`, disponível após recuperação de candidatos. O contrato valida somente IDs vigentes já recuperados, unicidade e suficiência (`sufficient`/`partial`); nunca concede autorização. A decisão não exclui alternativas do verificador independente. Em modo completo, a leitura automática não escolhe o primeiro candidato quando há múltiplas versões; a versão selecionada pelo modelo é aberta pela fronteira de autorização existente. Novas versões recuperadas invalidam uma seleção anterior. Perguntas neutras podem concluir uma decisão ambígua sem anexar fontes e, na recuperação com ferramentas desabilitadas, precisam de validação explícita do verificador. Fallback lexical permanece conservador e não recebe poderes adicionais da seleção. Métricas numéricas/categóricas registram decisões, rejeições, invalidações e suficiência. Não há chamada extra obrigatória para consultas simples. CI e validação com LLM real pendentes.

### Testes de seleção semântica

Adicionados testes focados de contrato, escolha de fonte com ranking inferior, preservação de alternativas, pergunta após recuperação, validação de referências fora da seleção, conflito, pergunta neutra após rejeição, invalidação por evidência nova, IDs inventados e resposta parcial em modo completo. Os modelos simulados verificam o contrato e o loop, não demonstram compreensão real; a rodada autorizada com modelo real continua necessária. Nenhum dado de produção é usado.

### Revisão de escolha e casos complementares reais

A seleção semântica pode ser revisada após rejeição do verificador, sem forçar o modelo a sustentar a primeira escolha. Acrescentados dois episódios sintéticos opt-in com três turnos: esclarecimento entre controladores concorrentes, seleção após a resposta do usuário e ficha de acesso incompleta. A matriz original (18 turnos) e o episódio histórico (5 turnos) foram preservados; a execução completa contém 26 turnos e separa os hashes do corpus original e ampliado. Nenhuma nova medição real foi produzida. CI da correção anterior de voucher (d890035) aprovado; CI da seleção semântica ainda precisa de confirmação no HEAD final.

### Compatibilidade do contrato de busca

CI 46028765142: 309 aprovados, uma falha de contrato (campo adicional `completeDocument:false` em trecho parcial), três skips reais. CI 46028857738: falha TS2339 no teste da ferramenta; corrigida pela tipagem `satisfies` no commit 5976cad. Preservado o formato anterior dos trechos da ferramenta de busca; `completeDocument:true` é acrescentado somente para documentos efetivamente completos. As asserções antigas continuam intactas. Novo CI necessário, sem alegação de validação com modelo real.

## Migração para arquitetura semântica ponta a ponta — checklist

Referência: PR #84, HEAD 77c0c45 (322 testes aprovados, 3 opt-in, 3 E2E).
- [x] S1 — Introduzir interpretação semântica de investigação, com IDs autorizados, sem roteamento lexical obrigatório quando o modelo está habilitado.
- [x] S2 — Contrato estruturado para intenção, modo, foco e contexto; validar forma e limites no servidor.
- [x] S3 — Propagar consulta semântica ao loop, recuperação e verificação sem prefixo fixo.
- [x] S4 — Consolidar seleção de alternativas, cobertura do verificador e capacidade de recuperação.
- [x] S5 — Tratar conflitos e esclarecimentos no loop com validação independente.
- [x] S6 — Atualização de memória via observações literais do usuário, sem promover hipóteses ou respostas da IA a fatos.
- [x] S7 — Simplificar fallback da rota semântica, preservando abstenção e compatibilidade offline.
- [x] S8 — Cobertura de contratos, integração e episódios reais; CI e avaliação real pendentes.

S1/S2/S3/S6 compartilham uma única chamada Structured Outputs antes da seleção de histórico. O orçamento é compartilhado com o agente. Os checks [x] indicam código implementado, não homologação. A compatibilidade offline conserva o roteador anterior. Falha do intérprete habilitado não usa regex para escolher assunto. A seleção de estado continua restrita ao usuário, conversa, revisão e permissões. Não há migration nem alterações de limiares.

### S4/S5/S7 — seleção, conflito e recuperação semânticos

No fluxo semântico, síntese factual com múltiplas versões exige seleção explícita; pergunta neutra pode encerrar sem escolher fonte. O verificador recebe até as 12 fontes vigentes do pool e quatro históricas, com a pergunta original e contexto marcado como relato, não evidência. Revisão de perguntas e conversa social usa contrato separado e orçamento compartilhado; recuperação não executa escrita. Conflito permite uma investigação complementar ou esclarecimento pelo LLM antes da abstenção. Leituras diretas no fluxo semântico exigem candidato obtido no turno. O fallback de produção deixa de sintetizar etapas após rejeição semântica; em falha de transporte/estrutura pode retornar trecho literal conservador ou ficha parcial segura, sem sobrepor conflito. O caminho offline mantém compatibilidade. Testes e homologação pendentes.

S4 complemento: preservada diversidade dos candidatos antes de adicionar trechos vizinhos, sem alteração de limiares. Documento completo pode substituir trecho redundante da própria versão no limite do pool; nenhuma alternativa é removida para forçar escolha. S5 complemento: perguntas explícitas usam barreira estrutural/de segredos seguida de revisão semântica. Preparação de artigo no fluxo semântico exige intenção de escrita e a revisão independente já existente. Validação pendente no HEAD final.

S8: os episódios HTTP reais opt-in ativam explicitamente o intérprete semântico; adicionada regressão HTTP de persistência e isolamento entre investigações e cinco novos turnos para troca/retomada informal e intenção pontual. Corpus original preservado. Falta confirmar CI e executar avaliação real.

S8 complemento: adicionados testes determinísticos do contrato Structured Outputs, IDs/observações inválidos, orçamento compartilhado, escolha explícita de conhecimento concorrente, revisão da pergunta, recuperação de conflito sem escrita, resposta parcial por IP, recusa de fallback lexical após rejeição semântica e cobertura do conjunto de 12 candidatos. As oito etapas têm implementação; CI do último commit e avaliações reais continuam pendentes. O CI de 6e9612e foi aprovado antes dos reforços subsequentes. Não houve merge, migration ou ajuste de limiares.
