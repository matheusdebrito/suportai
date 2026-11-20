# Deployment template — private SuportAI pilot

This repository **does not automatically deploy to any host**. The production compose is a reference, not a tested security certification. Keep `ALLOW_EXTERNAL_AI_DATA_PROCESSING=false` until approved.

## Before building

Install a current Docker Engine and Compose on a protected Linux machine. Configure trusted DNS/TLS, outbound firewall rules, backup storage, observability and the host-specific operational baseline separately.

Copy `deploy/production.env.example` to an operator-controlled file outside Git and set the real domain, origins and paths. Create three **different** files with 0600 permissions outside the repository: database password, complete `postgres://...` database connection URI (with `db` as host) and empty AI key if no provider is approved. Do not place secret values in shell arguments, GitHub Actions variables, Compose environment or tracked files. Keep the password and URL consistent.

Create the socket directory (for example `/srv/suportai/pdf-socket`) on the host owned by UID/GID `10001:10001`, permissions 0700. Only the worker and parser services mount it. No Docker socket is mounted.

## Architecture and invariants

- `pdf-parser`: `network_mode: none`; **no database/AI secret mounts**; runs as non-root; read-only root filesystem; all capabilities dropped; no-new-privileges; Docker-default seccomp; PID/CPU/memory bounds; only a private socket directory and constrained tempfs writable.
- `worker`: shares the socket directory read-only and connects to the parser via Unix socket. It has DB access for indexing but never parses PDFs locally in production. If the parser socket is absent, PDF indexing fails closed.
- `api`: private backend network; health checks via `/ready`.
- `web`: serves the static frontend through Caddy and proxies application requests to the API using a single HTTPS origin. Configure valid certificates/ACME for the destination DNS; internal networks may require an organization's CA instead.
- `db`: no host-published port. Persistent volume must be backed up externally; use separate DB/AI secret files with controlled host access.

## Dry-run (no deployment)

```bash
docker compose --env-file /secure/path/suportai-production.env -f deploy/compose.production.yml config --quiet
docker compose --env-file /secure/path/suportai-production.env -f deploy/compose.production.yml build
```

Run the database migrations **only after** a backup verified against an isolated restoration and authorized maintenance window. Do not execute automatic migrations during container startup:

```bash
docker compose --env-file /secure/path/suportai-production.env -f deploy/compose.production.yml up -d db pdf-parser
docker compose --env-file /secure/path/suportai-production.env -f deploy/compose.production.yml run --rm api node apps/api/dist/migrate.js
docker compose --env-file /secure/path/suportai-production.env -f deploy/compose.production.yml up -d api worker web
```

Commands above are instructions for an authorized operator, **not commands run by this change**. The initial administrator is created through a separate, one-time bootstrap process with its own securely mounted temporary password file; it must not be left in the API/worker environment after onboarding.

## Required verification before handling internal PDFs

- Inspect `docker compose ps` and the effective container settings, not merely the YAML file.
- Confirm the parser container **cannot reach any network**, has no database URL or AI key, cannot read any host file outside its mounts and has the prescribed memory/PID/CPU limits.
- Test a synthetic PDF over the socket, then disable the parser and verify the worker records a safe failure (no local fallback).
- Test HTTPS, cookies, sign-in, authorized/restricted content, RAG citations and worker indexing with dummy data.
- Configure off-host encrypted backups, at least one separate restoration rehearsal, monitoring, RPO/RTO, rollback and retention in accordance with organization policy.
- Run `node apps/api/dist/preflight.js` in the API container and `node apps/api/dist/pdf-isolation-preflight.js` with the worker's Linux security policy. Production images intentionally omit the development-only `tsx` runner.
- If any check fails, keep the pilot closed.

A Compose file cannot itself prove actual network isolation, kernel security controls, dependency security, external provider privacy or an executed recovery plan.
