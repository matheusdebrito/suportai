#!/usr/bin/env bash
# Homologação de Piloto — SuportAI
# Execute com: bash scripts/homologation-pilot.sh

set -euo pipefail

echo "=== HOMOLOGAÇÃO DE PILOTO - SuportAI ==="
echo "Data: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

# Verifica variáveis de ambiente necessárias
: "${EVAL_SYNTHETIC_LLM_APPROVED:=false}"
: "${OPENAI_API_KEY:?OPENAI_API_KEY não definida}"
: "${DATABASE_URL:?DATABASE_URL não definida}"

if [[ "$EVAL_SYNTHETIC_LLM_APPROVED" != "true" ]]; then
  echo "ERRO: EVAL_SYNTHETIC_LLM_APPROVED=true necessário para homologação com modelo real"
  exit 1
fi

echo "✓ Variáveis de ambiente validadas"
echo ""

# 1. Migração e preparação do banco
echo "=== 1. Preparação do banco de dados ==="
npm run db:migrate
echo "✓ Migrações aplicadas"
echo ""

# 2. Typecheck e build
echo "=== 2. Validação estática e build ==="
npm run typecheck
npm run build
echo "✓ Typecheck e build OK"
echo ""

# 3. Testes unitários e integração
echo "=== 3. Testes automatizados ==="
npm test
echo "✓ Testes automatizados OK"
echo ""

# 4. Avaliação com modelo real (validation split)
echo "=== 4. Avaliação com modelo real (validation split) ==="
npm run rag:evaluate -- --run --real --validation-only --json-output --output-file=homologation-results.json
echo "✓ Avaliação real concluída"
echo ""

# 5. Comparação com baseline
echo "=== 5. Comparação com baseline PR #71 ==="
npm run rag:evaluate -- --run --real --validation-only --baseline-compare --baseline-version=pr-71-dfbf776
echo "✓ Comparação com baseline concluída"
echo ""

# 6. Testes E2E (Playwright)
echo "=== 6. Testes E2E (Playwright/Chromium) ==="
npm run e2e
echo "✓ Testes E2E OK"
echo ""

# 7. Validação de segurança (PDF adversariais, injeção, etc.)
echo "=== 7. Validação de segurança ==="
npm test -- --grep="adversarial\|injection\|credential\|security"
echo "✓ Validação de segurança OK"
echo ""

echo "=== HOMOLOGAÇÃO CONCLUÍDA ==="
echo "Resultados salvos em: homologation-results.json"
echo "Data: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""
echo "PRÓXIMOS PASSOS MANUAIS:"
echo "1. Revisar homologation-results.json"
echo "2. Preencher checklist de homologação manual abaixo"
echo "3. Registrar decisão em verification.md"