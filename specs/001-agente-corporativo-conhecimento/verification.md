# Verificação do MVP — SuportAI

**Data:** 2026-11-20  
**Estado:** APROVADO COM RESSALVAS (para integração de código; NÃO aprovado para produção)

## Ambiente observado
- GitHub Actions, Node.js 22, serviço PostgreSQL 17/pgvector.
- PR #1, último commit antes do merge: ea544cc1b36568bb27ff347169ce4b9be3a9fe52.
- PR #2, último commit antes do merge: 2a0d5b8db44ee15c168169c2afff72411e1247e4.

## Resultados verificados
- Instalação de dependências, typecheck, build e testes unitários: CI verde nos commits citados.
- Migração inicial em PostgreSQL de teste: CI verde.
- Testes de integração do caminho artigo → revisão → worker → publicação e leitura: CI verde.
- Teste de upload e extração de PDF sintético: CI verde após correção do parser.
- Controle de acesso restrito no RAG, sem acesso após revogação, histórico de versões e onboarding por token: testes na CI.
- Barreira do agente para criação de artigos apenas com pedido expresso do usuário: testes unitários.

## Critérios de aceitação — evidência
- AC-001, AC-002, AC-003, AC-008, AC-009, AC-013, AC-023, AC-024, AC-025: há cobertura de integração total ou parcial nos testes versionados; validar especificidades restantes.
- AC-004, AC-006, AC-011 e AC-014: cobertura parcial por inspeção e testes de versão/acesso.
- AC-005, AC-007, AC-010, AC-012, AC-015 a AC-022: não inteiramente verificados; exigem avaliação com modelo real ou testes adicionais.
- Novas migrações: repetibilidade testada por duas execuções em CI após integração deste incremento.

## Lacunas e riscos
- Sem teste contra LLM real, qualidade conversacional, injeções adversariais completas e comportamento de alucinação em produção.
- Não verificados E2E no navegador, disponibilidade sob carga, restauração de backup nem política de tratamento de documentos internos por fornecedor.
- PDFs sem texto extraível ainda requerem revisão manual (sem OCR no MVP).
- Segredos sensíveis ainda precisam de revisão de política antes do uso com dados internos.

## Parecer
Aprovado **somente** para integração incremental do código no repositório, condicionado a CI verde.
**Não autoriza deploy de produção nem inclusão de dados internos reais.**
