# SuportAI — Operação, backup e recuperação

Este runbook é uma referência para a equipe de TI. **Os passos abaixo não foram executados em produção**.

## Precondições para ambiente real

1. Revisar fornecedor de IA, tratamento de dados e retenção. Manter `ALLOW_EXTERNAL_AI_DATA_PROCESSING=false` até aprovação.
2. HTTPS válido e reverse proxy configurado, `APP_ORIGIN` exatamente igual à origem do frontend, cookies `Secure` com `NODE_ENV=production`.
3. PostgreSQL 17/pgvector disponível, acesso restrito à rede de aplicação, credenciais fortes e backup em local externo protegido.
4. Processos separados para API e worker, com reinício automático e logs sem credenciais. Não colocar chaves no Git.
5. Validar migrações em clone do banco antes do ambiente real. Elas são versionadas com checksum; não editar migração já aplicada.
6. Planejar janela de manutenção, rollback e responsável de autorização; não interromper banco real por teste.

## Sinais de saúde

- `GET /health`: processo HTTP em funcionamento; **não comprova que a IA ou o worker funcionam**.
- `GET /ready`: conexão de API com PostgreSQL disponível.
- Worker: monitorar processo, falhas, jobs parados e atrasos de indexação.

Consulta somente leitura, em ambiente autorizado:

```sql
SELECT status,count(*) AS jobs
FROM ingestion_jobs GROUP BY status ORDER BY status;
SELECT version_id,status,attempts,updated_at,error
FROM ingestion_jobs
WHERE status='FAILED' OR (status='RUNNING' AND updated_at<now()-interval '5 minutes')
ORDER BY updated_at LIMIT 30;
```

O usuário autorizado pode solicitar reprocessamento de falhas pelo painel. Investigar a causa antes de repetir pedidos com documentos inválidos.

## Backup do banco (recomendação)

O MVP armazena PDFs no PostgreSQL (`bytea`), então o backup inclui também os arquivos. Necessário `pg_dump` **versão 17**, credenciais fornecidas fora de parâmetros da linha de comando.

Configurar `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` e um `PGPASSFILE` de permissão 0600. Em diretório seguro e com espaço suficiente:

```bash
umask 077
mkdir -p ./backups
pg_dump --format=custom --no-owner --no-acl \
  --file="./backups/suportai-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Guardar backup criptografado fora do servidor e estabelecer retenção/revisão de acesso conforme política aprovada. Não expor senha no shell, logs, PR ou comando de processo. Verificar integridade do arquivo com `pg_restore --list arquivo.dump` e registrar data/tamanho.

## Ensaio de restauração

**Nunca restaurar sobre o banco ativo de produção.** Use outro banco novo e vazio com mesmo PostgreSQL e extensão pgvector. Ajuste `PGDATABASE` para um nome **diferente** do banco real.

```bash
# Credenciais/host configurados previamente; não criar com nome de banco real.
createdb suportai_restore_validation
PGDATABASE=suportai_restore_validation pg_restore \
  --exit-on-error --no-owner --no-acl \
  --dbname=suportai_restore_validation ./backups/ARQUIVO.dump
PGDATABASE=suportai_restore_validation psql -v ON_ERROR_STOP=1 \
  -c "SELECT count(*) AS users FROM users;"
PGDATABASE=suportai_restore_validation psql -v ON_ERROR_STOP=1 \
  -c "SELECT count(*) AS versions FROM document_versions;"
```

Além de contagens, validar integridade referencial, usuários, versões publicadas, trechos do RAG, PDFs e estado de migrações. Testar consultas com usuário fictício sem habilitar acesso externo de IA. O ensaio só é considerado aprovado quando um operador registrar o resultado em ambiente isolado.

## Alterações e rollback

- Criar backup e ensaiar restauração **antes** da primeira migração em produção.
- Migrar schema uma vez, verificar checksum, executar `GET /ready`, worker, login e consulta.
- Em caso de falha, interromper novas escritas e investigar. **Não** executar `DROP`, `TRUNCATE` ou `--clean` no banco ativo.
- Não existe rollback automático de migrações. Para erros incompatíveis, preparar novo banco usando backup verificado e coordenar mudança de apontamento/corte de tráfego.
- Confirmar ausência de perda entre o instante do backup e o momento da recuperação.

## Restrições conhecidas

- PDFs digitalizados sem texto não usam OCR.
- Parser de PDF em processo filho tem tempo/heap/saída limitados, **não é sandbox de SO**.
- Detecção de segredos é heurística, não substitui classificação/revisão humana.
- Modelo externo depende de autorização de processamento; configuração da chave sozinha não habilita o envio de dados.
- Logs não devem conter arquivos, senhas, tokens temporários ou conteúdo privado.

## Pré-verificação antes de implantar

Executar **no ambiente de destino**, com os valores de configuração provisionados por mecanismo seguro (não imprimir segredos):

```bash
NODE_ENV=production npm run preflight -w @suportai/api
```

O comando valida uma lista curta de pré-requisitos: HTTPS em `APP_ORIGIN`, URL de banco presente, ausência de segredos de bootstrap e configuração coerente de envio externo de IA. Ele não abre conexões nem escreve no banco.

**Preflight verde não aprova produção.** Verificar manualmente isolamento do processamento de PDFs, TLS/reverse proxy, teste de restauração em banco separado, backups externos, RPO/RTO, monitoramento do worker e filas, política de retenção, implantação/rollback e autorização da empresa para usar dados internos e provedor de IA.
