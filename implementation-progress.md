# PR 84 — implementation progress

Source of truth: melhorias.md. No merge authorized. Code first, execution of tests last.

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
