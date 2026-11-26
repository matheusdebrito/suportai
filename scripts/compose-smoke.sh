#!/usr/bin/env bash
# Disposable CI project; does not read real credentials or touch the default project.
set -euo pipefail
export POSTGRES_PASSWORD=compose_smoke_password
export BOOTSTRAP_ADMIN_EMAIL=compose-smoke@example.test
export BOOTSTRAP_ADMIN_PASSWORD=Compose-Smoke-Password-123
export SUPORTAI_WEB_PORT=5174 SUPORTAI_DB_PORT=55432
export SUPORTAI_LOCAL_ORIGIN=http://localhost:5174
export ALLOW_EXTERNAL_AI_DATA_PROCESSING=false OPENAI_API_KEY=
project="suportai-smoke-$$"
temp="$(mktemp -d)"
dc(){ docker compose --env-file /dev/null -p "$project" "$@"; }
cleanup(){
  dc ps -a || true
  dc logs --tail=50 || true
  dc down -v --remove-orphans || true
  rm -rf "$temp"
}
trap cleanup EXIT
dc config --quiet
dc up -d --build
for ((i=0;i<45;i++)); do
  if curl -fsS "$SUPORTAI_LOCAL_ORIGIN/" >/dev/null; then break; fi
  sleep 2
done
curl -fsS "$SUPORTAI_LOCAL_ORIGIN/" >/dev/null
curl -fsS -c "$temp/cookies" -H 'Content-Type: application/json' \
  -H "Origin: $SUPORTAI_LOCAL_ORIGIN" \
  -d '{"email":"compose-smoke@example.test","password":"Compose-Smoke-Password-123"}' \
  "$SUPORTAI_LOCAL_ORIGIN/auth/login" | node -e "let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{if(JSON.parse(s).user?.role!=='ADMIN')process.exit(1)})"
curl -fsS -b "$temp/cookies" "$SUPORTAI_LOCAL_ORIGIN/auth/me" | node -e "let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{if(JSON.parse(s).role!=='ADMIN')process.exit(1)})"
test "$(curl -s -o /dev/null -w '%{http_code}' -b "$temp/cookies" -X POST -H 'Origin: http://untrusted.example.test' "$SUPORTAI_LOCAL_ORIGIN/auth/logout")" = 403
curl -fsS -b "$temp/cookies" -X POST -H "Origin: $SUPORTAI_LOCAL_ORIGIN" "$SUPORTAI_LOCAL_ORIGIN/auth/logout" >/dev/null
test "$(curl -s -o /dev/null -w '%{http_code}' -b "$temp/cookies" "$SUPORTAI_LOCAL_ORIGIN/auth/me")" = 401
dc exec -T worker node -e "const c=require('node:net').createConnection('/run/suportai/pdf-parser.sock');c.on('connect',()=>{c.destroy();process.exit(0)});c.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),2000).unref()"
echo 'Local Compose startup, login, session, origin validation, logout and PDF IPC: OK'
