# Etapa 1 — avaliação real inicial do HEAD 7818cc2

Data: 27 de novembro de 2026

Revisão: diagnóstico técnico por IA; não é homologação humana.

## Ambiente e configuração

- Branch: `natural-support-responses`
- Commit avaliado: `7818cc2ad93c06e957a4f99315518ac759c687d4`
- Banco: PostgreSQL 17 com pgvector, descartável e isolado das instâncias Compose existentes
- Dados: somente usuários, documentos e mensagens sintéticos criados pelos testes
- Modelo de chat: `gpt-4.1-mini`
- Embeddings: `text-embedding-3-small`
- Temperatura: `0.2`
- Processamento externo: habilitado explicitamente apenas para esta avaliação
- Migrações: 001–010 aplicadas; segunda execução sem alterações

Nenhuma chave, URL com credencial ou dado de produção foi gravado nos relatórios.

## Execução obrigatória

Comando executado em `apps/api`:

```text
node --import tsx --test src/investigation-chat.test.ts
```

Os três testes opt-in obrigatórios foram executados, sem skips:

| Teste | Resultado |
| --- | --- |
| `independent synthetic retrieval calibration corpus` | aprovado |
| `real model phone episode with actual retrieval` | reprovado no segundo turno |
| `expanded real HTTP support episode matrix` | reprovado com 55 checks |

Resultado total do arquivo: 10 testes, 8 aprovados, 2 reprovados, 0 ignorados. A cobertura conversacional existente no HEAD foi confirmada em 10 episódios e 31 turnos: cinco turnos do telefone e nove episódios/26 turnos na matriz ampliada.

## Resultado de recuperação

O corpus inicial contém somente quatro casos independentes: dois no piloto e dois no holdout. Todos recuperaram o único documento relevante esperado. Esse resultado confirma que a recuperação isolada funcionou na rodada, mas não sustenta calibração de parâmetros nem generalização.

## Falha conversacional e causa-raiz

A falha primária está na camada **1 — interpretação da intenção/contrato semântico**, com efeitos nas camadas **2 — contexto ou memória** e **10 — infraestrutura do harness**.

O schema estrito de `semantic_turn_v1` controla tipos e enums, mas não codifica todas as relações condicionais exigidas pelo parser. O prompt pede que `route=existing` use `topic=null`, que equipamento/ambiente sejam substrings literais da mensagem atual e que o modo anterior seja herdado em seguimentos. Em chamadas reais sintéticas, o modelo devolveu, entre outros:

- `route=existing` junto de `topic="telefone de laboratório"`;
- `equipment="telefone de laboratório"` para a mensagem curta `não entendi a parte da senha`;
- `mode=guided`, `intent=clarify` e uma consulta de esclarecimento para `me dê o passo a passo completo`.

Essas respostas passam pelo JSON Schema do provedor, mas são rejeitadas corretamente por `parseSemanticTurn`. A rota HTTP então retorna a abstenção de interpretação e não chama o agente capturado. O resultado observado foi perda ou troca de investigação, ausência de recuperação/fonte e falha em retomar ou mudar o assunto.

Na matriz ampliada, somente cinco dos 17 turnos posteriores ao primeiro mantiveram captura do agente. Foram registrados 55 checks falhos. O relatório preserva as respostas, as fontes, os IDs sintéticos, os checks e as métricas disponíveis.

## Observações secundárias

Nos primeiros turnos que chegaram ao agente, também ocorreram rejeições `claim_shape`, `invalid_question` e `invalid_reference`. Elas pertencem principalmente à camada **7 — verificação e grounding** e serão isoladas depois que o corpus e o baseline ampliados forem congelados.

O teste do telefone escreve seu relatório somente após completar os cinco turnos. Como falhou no segundo turno ao exigir captura, não produziu um relatório parcial. Essa é uma deficiência do harness a corrigir na Etapa 4; a falha e o output do teste foram preservados neste resumo e no checkpoint.

## Conclusão da etapa

A Etapa 1 cumpriu o objetivo de estabelecer o comportamento real do HEAD e classificar as falhas antes de mudanças funcionais. O HEAD não está homologado: CI determinístico verde não compensa a reprovação da avaliação real. A próxima etapa é ampliar e congelar o corpus do RAG antes de estabelecer o novo baseline e implementar correções.
