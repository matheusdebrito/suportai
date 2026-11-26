# SuportAI

Assistente interno com cérebro de conhecimento baseado em artigos e PDFs, recuperação RAG e publicação supervisionada.

## Escopo inicial

- Piloto para TI, preparado para outros setores sem multiempresa.
- Login próprio; administrador cria usuários e redefine senhas por código temporário.
- Administração simples de departamentos e vínculos de colaboradores (não altera concessões de leitura).
- Conhecimento compartilhado e restrito com permissões no backend.
- Busca textual PostgreSQL e embeddings pgvector (quando a API de IA estiver configurada).
- Conversa com agente, ferramentas de busca, avaliações das respostas e prévias de artigos, sem publicação automática.
- Fluxo de rascunho, revisão, aprovação humana (inclusive autor-aprovador) e versionamento.
- Pedidos de ajuste com parecer, versões corrigidas e aviso de artigos semelhantes antes de nova criação.
- Upload de PDF com worker e processamento assíncrono.
- Reenvio de PDFs após pedido de ajustes e revisões de PDFs publicados, sempre com nova versão e aprovação humana.

## Requisitos

Docker Desktop/Compose v2 para a execução completa em contêineres. Para execução direta no host: Node.js 22+ e PostgreSQL 17 com extensão pgvector.

## Subir toda a aplicação com Docker Compose (local)

Use Docker Desktop/Compose v2. Na raiz do repositório:

1. Se ainda não existir `.env`, copie `.env.example` (PowerShell: `Copy-Item .env.example .env`). Se já existir, acrescente as variáveis faltantes sem sobrescrever suas credenciais. O Compose lê `.env` automaticamente. Se você utilizava `.env.compose`, transfira os valores para `.env` antes de remover o arquivo antigo; preserve a senha do banco existente.
2. Preencha `POSTGRES_PASSWORD`, `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD` (12–256 caracteres). Não use credenciais reais de produção.
3. Execute `docker compose up -d --build`.
4. Confira `docker compose ps -a` e abra **http://localhost:5173** com as credenciais de bootstrap.
5. Se houver falha, use `docker compose logs --tail=100 migrate bootstrap api worker web pdf-parser`.

O Compose sobe PostgreSQL/pgvector, migrações, criação inicial de administrador, API, worker, parser PDF isolado por socket Unix e frontend Caddy. Migração e bootstrap devem terminar com código 0. O bootstrap não altera senhas existentes. Use o mesmo `POSTGRES_PASSWORD` se reutilizar o volume antigo. Após o primeiro acesso, remova as credenciais de bootstrap de `.env` e execute `docker compose rm -f bootstrap` para remover o contêiner encerrado.

O `.env` é ignorado pelo Git e excluído do contexto de build Docker; somente `.env.example`, sem credenciais reais, é versionado. Não compartilhe a saída de `docker compose config` sem ocultar segredos.

O volume do banco é persistente: `docker compose down` não apaga dados. **Não use `down -v` em um banco que deseja preservar.** Se alterar `SUPORTAI_WEB_PORT`, ajuste `SUPORTAI_LOCAL_ORIGIN` para a mesma origem e acesse exatamente esse endereço. A API não tem porta pública e o proxy fornece os endpoints na mesma origem.

A IA externa permanece desabilitada por padrão; para testes com dados sintéticos autorizados, configure a chave e habilite explicitamente `ALLOW_EXTERNAL_AI_DATA_PROCESSING=true`. Sem isso, a busca local continua funcionando.

Este Compose é somente para acesso HTTP local (portas bindadas a 127.0.0.1). Para produção HTTPS, use o procedimento separado em [implantação](docs/implantacao-container.md); não exponha o Compose local à rede.

## Primeira execução local sem contêiner da aplicação

1. Copie `.env.example` para `.env` e defina credenciais de banco, `APP_ORIGIN` e opcionalmente a chave de IA.
2. Preencha `POSTGRES_PASSWORD` no mesmo `.env`, ajuste `DATABASE_URL` para corresponder à senha e porta do banco local e inicie `docker compose up -d db`.
3. `npm install`
4. `npm run db:migrate` (as migrações são versionadas e podem ser executadas novamente com segurança).
5. Configure `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD` temporariamente; `npm run admin:bootstrap`; remova esses valores do ambiente.
6. `npm run dev:api` e, em outro terminal, `npm run worker -w @suportai/api`.
7. `npm run dev:web`; acesse http://localhost:5173.

**Migrações:** cada arquivo em `apps/api/sql/` é aplicado uma única vez e verificado por checksum. Se o banco já foi criado pelo script antigo, sem o histórico de migrações, a atualização bloqueia a operação para evitar assumir um esquema desconhecido. Faça backup, confira o esquema existente e planeje a regularização antes de prosseguir; não apague tabelas para contornar o aviso.

**Privacidade da IA:** preencher `OPENAI_API_KEY` não habilita chamadas externas. O backend só envia perguntas, trechos recuperados e entradas de embeddings quando `ALLOW_EXTERNAL_AI_DATA_PROCESSING=true` estiver definido explicitamente. Essa configuração só deve ser habilitada depois de analisar e autorizar o tratamento de informações internas pelo provedor. Sem essa autorização, a busca textual local permanece disponível.

**Atenção:** configure `DATABASE_URL` para a senha utilizada no Compose. A API deve estar atrás de HTTPS para uso real; cookies seguros são habilitados em produção. `OPENAI_API_KEY` e a autorização explícita habilitam o LLM e embeddings; sem ambos, a consulta oferece apenas trechos por busca textual.

Na criação de usuários, o backend retorna um código temporário de 15 minutos, que deve ser transmitido por um canal seguro. O usuário define a própria senha com `/auth/change-password`.

## Verificação

- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run e2e` (requer Playwright/Chromium, PostgreSQL e usuário administrador de teste; a CI inicia API e frontend automaticamente)

Há testes de integração com PostgreSQL, testes de ponta a ponta com Chromium e ensaio de restauração de backup com banco fictício na CI. **Esses testes não substituem a validação com modelo de IA real, a análise de dependências nem um ensaio de restauração de backup antes da produção.** Não use dados confidenciais reais sem avaliar política de retenção e processamento do fornecedor do LLM/embeddings.

## Documentação

- [Especificação funcional](specs/001-agente-corporativo-conhecimento/spec.md)
- [Plano técnico](specs/001-agente-corporativo-conhecimento/plan.md)
- [Tarefas de validação](specs/001-agente-corporativo-conhecimento/tasks.md)
- [Verificação de critérios do MVP](specs/001-agente-corporativo-conhecimento/verification.md)
- [Runbook de operação e recuperação](docs/operacao.md)
- [Implantação isolada por contêiner](docs/implantacao-container.md)
- [Backup, restauração e monitoramento](docs/backup-restore-automation.md)
- [Avaliação sintética do RAG](docs/avaliacao-rag.md)
- [Roadmap de evolução do harness (nível 3 → 4)](docs/roadmap-harness.md)
- [Testes e riscos residuais de PDFs](docs/avaliacao-pdf.md)

## Limitações atuais

Não há OCR de PDFs digitalizados. Não execute comandos ou acesso SSH com o agente. A persistência de PDFs em bytea é um compromisso temporário para o piloto; recomenda-se armazenamento isolado antes de escalar. A busca e indexação suportam fallback textual; a avaliação de RAG ainda precisa ser realizada com casos reais.

## Validação adicional

- `npm run rag:evaluate -w @suportai/api`: lista cenários fictícios, sem chamadas externas.
- `NODE_ENV=production npm run preflight -w @suportai/api`: verifica configuração sem expor segredos; **não é autorização de produção**.
- A avaliação com modelo real requer `EVAL_SYNTHETIC_LLM_APPROVED=true`, chave própria e aprovação para custos. Nenhuma CI habilita essa configuração.
