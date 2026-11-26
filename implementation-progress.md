# PR 84 — implementation progress

Source of truth: melhorias.md. No merge authorized. Code first, execution of tests last.

| Requirement | State | Evidence / next action |
|---|---|---|
| Active investigation and short follow-ups | Code written, unverified | chat.ts, investigation-dialogue.ts; verify long histories and explicit switches |
| Structured contextual lookup | Code written, unverified | support-dialogue.ts |
| Persist support mode | Code written, unverified | investigation-state.ts, migration 010 |
| Unified response contract and operational credentials | Code written, unverified | agent.ts, support-dialogue.ts |
| Nonclaim vs unsupported | Code written, unverified | agent-verifier.ts |
| Procedural dependencies | Code written, unverified | agent-verifier.ts; review rejection of partial procedures |
| False blocks and naturalness | Partial | episode-quality.ts, episode-review.ts; wire review CLI and capture candidate vs final answer |
| Structural chunks | Code written, unverified | knowledge.ts; check bounds and lossless coverage |
| Adjacent retrieval | Code written, unverified | retrieval.ts; check authorization and ordering |
| Complete document | Code written, unverified | agent.ts, grounding-fallback.ts |
| Calibration | Partial | rag-calibration.ts; add reviewed candidate capture and lexical threshold evaluation |
| Real HTTP episodes | Partial | investigation-chat.test.ts; verify per-turn sources, stage progression and direct answers |
| Effective metadata | Code written, unverified | rag-evaluation.ts |
| Reproducible baseline | Pending | version corpus and configuration; real execution and human labels required |
| Documentation counts | Pending | derive from current scenarios |
| Final verification | Pending | typecheck, build, migration, tests, security, real model and pilot review |

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
