# Support evaluation protocol

Run the existing test suite against an isolated migrated PostgreSQL test database. For the opt-in real HTTP episode set NODE_ENV=test, DATABASE_URL equal to TEST_DATABASE_URL, RUN_REAL_EPISODES=1, and configure an explicitly authorized external AI provider. Run node --import tsx --test src/investigation-chat.test.ts from apps/api. Never use a production database.

The report separates retrieval recall, precision and reciprocal rank from turn responses and observable quality proxies. Human review is mandatory: label correctness, false acceptance, false rejection, unnecessary partial warnings, fallback degradation, repeated questions and completeness. Do not interpret overlap or regex metrics as semantic correctness.

Record commit, model, embedding model, effective agent limits, corpus version and human labels with each baseline. Use synthetic fixtures only for this runner. For calibration, use a separately reviewed pilot corpus, hold out validation cases, compare candidate thresholds on recall, precision and MRR, and require no authorization regressions. Do not change thresholds before measured results. Existing documents need controlled reindexing to benefit from the new chunking; do not reindex production automatically.

## Corpus de calibração v2

O corpus congelado `suportai-rag-calibration-v2` é gerado por `npm run rag:corpus -w @suportai/api -- <arquivo>` a partir de `rag-calibration-corpus-v2.ts`. Ele contém 100 casos positivos nas oito categorias da missão, divididos em 60 casos piloto e 40 holdout. Famílias, documentos candidatos e consultas não atravessam as divisões. Cada caso identifica documentos e chunks relevantes, comportamento esperado, justificativa técnica e risco. A revisão registrada é de IA técnica; revisão humana permanece pendente.

Os 20 casos de segurança e abstenção ficam em uma suíte separada, com `split=security` e sem documentos relevantes esperados. Eles não entram em recall, precisão ou MRR positivos. A suíte cobre, em pares, documento não autorizado, conteúdo restrito, revogação, prompt injection, credenciais pessoais, tokens/segredos, ausência de conhecimento, fonte incompatível, conflito insolúvel e indução de procedimento inventado.

The historical real phone report is versioned under `docs/validation-pr-84-evidence/` (evaluated code 036f2fa). It has AI-reviewed labels, not human homologation. Preserve these files unchanged.

## Strict verifier and expanded episodes

The verifier requests strict JSON Schema `grounding_review_v1`. Provider incompatibility, refusal, malformed JSON, schema errors, claim coverage errors and transport errors are distinguished. No downgrade to free JSON. The test-only capture wraps the actual responder and retrieval, not the HTTP response; it records verifier candidates/outcomes, actual usage when provided, bounded metrics and ranked fixture version/ordinal identifiers. Production responses and telemetry contain no evaluation candidate text.

In addition to the original 5-turn phone episode and the 4-case calibration corpus, the opt-in suite includes the original five expanded episodes (18 turns) and two complementary semantic-selection episodes (3 turns). The complementary cases require a clarifying question before choosing between conflicting controllers, then the correct controller-specific evidence, and a cited partial answer to an access-only note without reproducing unrelated credentials. The original 23 conversational turns and historical phone report remain unchanged; the new matrix reports the base matrix hash and the full evaluation corpus hash separately (26 turns in total). Keep the original episode and its corpus hash unchanged for comparisons; expanded corpus is separately reported. Run on an explicitly authorized local test environment with the same model and limits as the historical baseline:

- Set `NODE_ENV=test`, `RUN_REAL_EPISODES=1`, `ALLOW_EXTERNAL_AI_DATA_PROCESSING=true`, `DATABASE_URL=TEST_DATABASE_URL` (isolated migrated pgvector database), and `EVALUATION_COMMIT` to actual git HEAD. Use an authorized API key without printing it.
- Set `EPISODE_REPORT_PATH`, `CALIBRATION_REPORT_PATH`, and `EXPANDED_EPISODE_REPORT_PATH` to distinct new paths outside the historical evidence directory. Run `node --import tsx --test src/investigation-chat.test.ts` in apps/api.
- Run `npm run episode:compare -- ../../docs/validation-pr-84-evidence/episode-real-report.json <new-phone-report> <comparison-output>` in apps/api. Optional matched review files can be provided with their shared explicit origin (`ai` or `human`). No human review may be fabricated.
- New report captures per-turn diagnostics; the historical report did not. Null deltas for historical verifier failures, latency or token usage are unavailable, not zero. Compare those measures only against a future matched telemetry-bearing baseline or a fresh authorized run of the historical code. Keep calibration thresholds unchanged until a representative reviewed corpus supports a change.

CI executes the deterministic regressions; real episodes remain opt-in to avoid unauthorized external processing. Record failed cases and human review separately; one passing phone episode does not establish 95% continuity across representative episodes.

## Semantic architecture evaluation

The production HTTP path uses `semantic_turn_v1` before retrieving the selected investigation, sharing the existing budget with tool calls and the grounding reviewer. Both opt-in HTTP runners explicitly enable this interpreter even when a capture responder is injected. The original 23 turns and the previous three supplemental turns remain intact. Two additional episodes (five turns) exercise informal intent, a subject switch without magic keywords, resumption, complete mode and a focused follow-up, for 10 episodes / 31 turns total. Reports identify the architecture and record semantic route, intent, interpreter status, observations, required selection, conflicts and clarification checks through the existing capture. The original phone baseline is unchanged. A scripted contract or green CI is not evidence of real-model semantic quality; run the opt-in suite and review the answers.

## Execução automatizada no Windows

Na raiz de um checkout atualizado e limpo, com Node.js 22+ e Docker Desktop em execução:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\evaluate-support.ps1 -ApproveExternalAI
```

A opção `-ApproveExternalAI` autoriza explicitamente as chamadas faturáveis da API da OpenAI com fixtures sintéticas. O script reutiliza `OPENAI_API_KEY` do ambiente ou solicita a chave uma vez, de modo oculto. Não depende de créditos do Codex. Não imprime nem versiona a chave. Usa `gpt-4.1-mini`, `text-embedding-3-small`, os limites do baseline e a política de recuperação 0,45/0,56.

O script instala as dependências com `npm ci` (opcionalmente `-SkipInstall` se já instaladas), cria um contêiner PostgreSQL 17/pgvector exclusivo, com porta loopback dinâmica, aplica migrations duas vezes, executa os 10 episódios/31 turnos e os quatro casos iniciais, usa um segundo banco descartável para os 100 casos positivos e 20 casos de segurança do RAG, e compara o episódio de telefone com o baseline histórico. O banco normal e seus volumes não são utilizados. Um teste conversacional reprovado não impede as avaliações independentes restantes; erros de preparação interrompem o fluxo. Os relatórios parciais e logs são preservados, e as variáveis do processo são restauradas no `finally`. Encerramento forçado pode exigir parar manualmente o contêiner exclusivo `suportai-eval-*` daquela execução.

Ao terminar, envie o ZIP `test-results/support-eval-*.zip`, contendo os relatórios, logs e `summary.json`. Código de saída 0 indica aprovação das asserções automatizadas e cobertura/comparação verificadas, **não** homologação semântica/humana nem cumprimento automático de todas as metas de qualidade; código 1 indica falha ou avaliação que exige revisão; 2 indica falta de opt-in. A suíte de segurança do RAG mede recuperação, não a síntese de todos os ataques. Nenhum merge ou deploy é realizado.

### Recuperação estrutural após a rodada 3cc366f

Uma falha de cobertura/referência do verificador pode acionar uma única revisão `grounding_indexed_review_v2`, ainda no orçamento original. O servidor define uma chave obrigatória por unidade e fornece spans literais com IDs; o modelo seleciona IDs, sem redigitar citações. O backend resolve os IDs e reaplica as verificações de evidência, seleção, vigência e literais. Conflitos/rejeições semânticas não são convertidos em aprovação. O intérprete pode corrigir uma saída contratualmente inválida uma vez. O último assunto visível é somente pista para o intérprete, sem associação automática. O corpus e os limiares permanecem congelados. A eficácia exige nova execução real e revisão humana.
