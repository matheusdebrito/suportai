# SuportAI

Assistente interno com cérebro de conhecimento baseado em artigos e PDFs, recuperação RAG e publicação supervisionada.

## Escopo inicial

- Piloto para TI, preparado para outros setores sem multiempresa.
- Login próprio; administrador cria usuários e redefine senhas por código temporário.
- Conhecimento compartilhado e restrito com permissões no backend.
- Busca textual PostgreSQL e embeddings pgvector (quando a API de IA estiver configurada).
- Conversa com agente, ferramentas de busca e prévias de artigos, sem publicação automática.
- Fluxo de rascunho, revisão, aprovação humana (inclusive autor-aprovador) e versionamento.
- Upload de PDF com worker e processamento assíncrono.

## Requisitos

Node.js 22+, PostgreSQL 17 com extensão pgvector, e Docker/Compose opcional.

## Primeira execução local

1. Copie `.env.example` para `.env` e defina credenciais de banco, `APP_ORIGIN` e opcionalmente a chave de IA.
2. Crie um segredo forte: `export POSTGRES_PASSWORD='uma-senha-forte'`; inicie `docker compose up -d db`.
3. `npm install`
4. `npm run db:migrate` (as migrações são versionadas e podem ser executadas novamente com segurança).
5. Configure `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD` temporariamente; `npm run admin:bootstrap`; remova esses valores do ambiente.
6. `npm run dev:api` e, em outro terminal, `npm run worker -w @suportai/api`.
7. `npm run dev:web`; acesse http://localhost:5173.

**Migrações:** cada arquivo em `apps/api/sql/` é aplicado uma única vez e verificado por checksum. Se o banco já foi criado pelo script antigo, sem o histórico de migrações, a atualização bloqueia a operação para evitar assumir um esquema desconhecido. Faça backup, confira o esquema existente e planeje a regularização antes de prosseguir; não apague tabelas para contornar o aviso.

**Atenção:** configure `DATABASE_URL` para a senha utilizada no Compose. A API deve estar atrás de HTTPS para uso real; cookies seguros são habilitados em produção. `OPENAI_API_KEY` ativa o LLM e embeddings; sem a chave, a consulta oferece apenas trechos por busca textual.

Na criação de usuários, o backend retorna um código temporário de 15 minutos, que deve ser transmitido por um canal seguro. O usuário define a própria senha com `/auth/change-password`.

## Verificação

- `npm run typecheck`
- `npm run test`
- `npm run build`

Há testes unitários iniciais de permissões e segmentação, mas **testes de integração e E2E, execução real de CI, análise de dependências e restauração de backup são obrigatórios antes de produção**. Não use dados confidenciais reais sem avaliar política de retenção e processamento do fornecedor do LLM/embeddings.

## Documentação

- [Especificação funcional](specs/001-agente-corporativo-conhecimento/spec.md)
- [Plano técnico](specs/001-agente-corporativo-conhecimento/plan.md)
- [Tarefas de validação](specs/001-agente-corporativo-conhecimento/tasks.md)

## Limitações atuais

Não há OCR de PDFs digitalizados. Não execute comandos ou acesso SSH com o agente. A persistência de PDFs em bytea é um compromisso temporário para o piloto; recomenda-se armazenamento isolado antes de escalar. A busca e indexação suportam fallback textual; a avaliação de RAG ainda precisa ser realizada com casos reais.
