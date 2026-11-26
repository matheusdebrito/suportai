# Support evaluation protocol

Run the existing test suite against an isolated migrated PostgreSQL test database. For the opt-in real HTTP episode set NODE_ENV=test, DATABASE_URL equal to TEST_DATABASE_URL, RUN_REAL_EPISODES=1, and configure an explicitly authorized external AI provider. Run node --import tsx --test src/investigation-chat.test.ts from apps/api. Never use a production database.

The report separates retrieval recall, precision and reciprocal rank from turn responses and observable quality proxies. Human review is mandatory: label correctness, false acceptance, false rejection, unnecessary partial warnings, fallback degradation, repeated questions and completeness. Do not interpret overlap or regex metrics as semantic correctness.

Record commit, model, embedding model, effective agent limits, corpus version and human labels with each baseline. Use synthetic fixtures only for this runner. For calibration, use a separately reviewed pilot corpus, hold out validation cases, compare candidate thresholds on recall, precision and MRR, and require no authorization regressions. Do not change thresholds before measured results. Existing documents need controlled reindexing to benefit from the new chunking; do not reindex production automatically.

No real-model baseline is claimed by this change.
