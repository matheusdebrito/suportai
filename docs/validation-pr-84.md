# Validação local do PR #84

Data: 27 de novembro de 2026

Branch: `natural-support-responses`

SHA inicial: `a9dcc890be060a3e87bb0f6ea119f64deb8c809f`

SHA do código após as correções e usado na avaliação definitiva: `036f2fa7f64ce1204ccdd5af0a3042d1d55554a6`

## Parecer executivo

As mudanças do PR estão tecnicamente coerentes e a avaliação sintética com modelo real atendeu aos critérios automatizados de continuidade, grounding, recuperação e formato. Foram encontrados e corrigidos seis grupos de regressões no verificador, na recuperação contextual e nos modos guiado/completo, incluindo um caminho sem evidência para respostas técnicas pontuais. As correções mantêm a decisão de autorização no backend e falham de forma fechada quando falta evidência factual.

O PR fica **tecnicamente pronto após CI Linux verde**, com uma pendência não bloqueante para a implementação: revisão humana das cinco respostas conversacionais. A avaliação por IA não substitui essa revisão. Nenhum merge foi realizado.

## Ambiente e proteção de dados

- Windows, Node.js `v24.21.0`, npm `11.19.0`; o requisito do projeto é Node.js 22 ou superior.
- PostgreSQL 17 com pgvector em contêiner local e bancos descartáveis exclusivos desta validação.
- Somente documentos, contas e mensagens sintéticos.
- `DATABASE_URL` e `TEST_DATABASE_URL` apontaram para o mesmo banco isolado.
- `NODE_ENV=test` e `RUN_REAL_EPISODES=1` na avaliação real.
- `ALLOW_EXTERNAL_AI_DATA_PROCESSING=true` somente na avaliação real sintética; testes comuns executados com processamento externo desabilitado.
- Nenhuma chave, senha de ambiente, cookie, URL com credencial ou dado de produção foi registrado.
- Migrações 001–010: primeira execução aplicou todas; segunda execução informou todas como inalteradas.

Configuração efetiva registrada no relatório do episódio:

| Item | Valor |
| --- | --- |
| Modelo de chat | `gpt-4.1-mini` |
| Modelo de embeddings | `text-embedding-3-small` |
| Temperatura de geração | `0.2` |
| Passos máximos | 8 |
| Buscas máximas | 5 |
| Fontes máximas | 12 |
| Tokens máximos por chamada | 1.800 |
| Tokens máximos de conclusão por turno | 9.000 |
| Tokens totais máximos por turno | 40.000 |
| Prazo máximo do turno | 60 s |

O provedor não devolveu custo monetário consolidado. A telemetria estimada do guardrail observada na execução definitiva totalizou 33.371 tokens de entrada e 910 de saída (34.281 no total). Esses números são estimativas internas para orçamento do agente, não faturamento do provedor; por isso nenhum custo foi calculado.

## Avaliação conversacional com modelo real

Comando executado em `apps/api`:

```text
node --import tsx --test src/investigation-chat.test.ts
```

Resultado definitivo: 8 testes executados, 8 aprovados, 0 reprovados e 0 ignorados. Os casos `independent synthetic retrieval calibration corpus` e `real model phone episode with actual retrieval` foram realmente executados.

Todas as respostas abaixo usaram a mesma investigação `42a55c53-3cb5-4a78-9a19-29554d39c0d5` e a mesma versão vigente sintética do documento `Telefone de laboratório`:

| Turno | Mensagem | Resposta produzida | Evidência recuperada | Modo |
| --- | --- | --- | --- | --- |
| 1 | Preciso configurar um telefone de laboratório | Primeiro, pega o IP do telefone no menu Status dele. `[1]` Conseguiu ver o IP? | `Consulte o IP no menu Status.` | `guided` |
| 2 | sim | Abriu o IP no navegador e conseguiu entrar com a senha `admin`? `[1]` | `Abra o IP no navegador.` e `Use a senha padrão admin.` | `guided` |
| 3 | não entendi a parte da senha | Depois de pegar o IP, abre ele no navegador e tenta entrar com a senha padrão `admin`. `[1]` Conseguiu acessar essa tela de configuração? | Linhas vigentes de navegador e senha | `guided` |
| 4 | a senha pode ser admin | Use a senha padrão admin. `[1]` | Linha exata vigente da senha operacional padrão | `guided` |
| 5 | me dê o passo a passo completo | Introdução curta e quatro passos: consultar IP, abrir no navegador, usar `admin` e ativar `Account Active: YES`. `[1]` | Documento vigente completo, sem mesclar versões | `complete` |

O assunto permaneceu ativo no turno curto, a progressão não repetiu a primeira etapa e a preferência só mudou após o pedido explícito do procedimento completo. Os valores `admin` e `Account Active: YES` foram preservados literalmente. Não houve fonte histórica, revogada ou não autorizada.

### Métricas conversacionais

O resumo abaixo foi produzido a partir de rótulos de IA fornecidos separadamente para os cinco turnos. Não são rótulos humanos.

| Métrica | Resultado |
| --- | ---: |
| Episódios / turnos | 1 / 5 |
| Continuidade | 1,0 |
| Falsas aceitações | 0 |
| Falsos bloqueios | 0 |
| Fallbacks degradados | 0 |
| Avisos parciais desnecessários | 0 |
| Perguntas repetidas | 0 |
| Fontes não autorizadas | 0 |
| Vazamentos de segredo | 0 |
| Respostas indiretas | 0 |
| Etapas inadequadas | 0 |
| Procedimentos incompletos | 0 |

Os proxies automáticos também registraram zero linhas repetidas, boilerplate, Markdown escapado e avisos parciais nos cinco turnos. A sobreposição literal foi 1,0 na resposta pontual da senha e aproximadamente 0,69 no procedimento completo, resultado esperado para fallbacks determinísticos que preservam valores e ordem. Sobreposição literal não foi usada como prova de correção semântica.

## Avaliação do RAG

### Calibração

`npm run rag:calibrate` avaliou quatro documentos sintéticos independentes: dois no piloto e dois no holdout. A política vigente (`semanticMinimum=0.56`, `diversityPenalty=0.18`, `lexicalMinimum=0`) e as políticas candidatas empataram no piloto. A política vigente foi preservada e comparada uma única vez no holdout.

| Conjunto | Recall | Precisão | MRR |
| --- | ---: | ---: | ---: |
| Piloto, política selecionada | 1,0 | 1,0 | 1,0 |
| Holdout, política selecionada | 1,0 | 1,0 | 1,0 |
| Holdout, baseline | 1,0 | 1,0 | 1,0 |

`applied=false`: nenhum limiar de produção foi alterado. O corpus pequeno e não revisado por humanos não oferece evidência suficiente para ajuste. A captura exercitou similaridade semântica e cobertura lexical, mas não persistiu a distribuição dos scores por candidato; isso permanece uma limitação analítica.

### Cobertura funcional

- chunks estruturais: testes verificam cobertura sem perda e limites;
- chunks adjacentes: testes verificam ordem, mesma versão e filtragem autorizada;
- documento completo: o turno 5 recuperou a versão vigente completa e manteve os quatro estágios;
- permissões: fontes são filtradas antes do modelo, e regressões cobrem revogação e escopo;
- contexto: o turno `sim` recuperou o próximo trecho usando o assunto estruturado da investigação;
- grounding: `npm run rag:evaluate -w @suportai/api -- --grounding` listou 15 cenários sintéticos, sem chamada externa, cobrindo campos corretos, invenções, pré-requisitos, ambiente, versão histórica, conflito, revogação e prompt injection;
- baseline: `npm run episode:review` e `npm run episode:baseline` consolidaram cinco turnos; o baseline marcou `criteriaMet=true` e preservou `humanReview=pending` no relatório de origem.

A indexação de conteúdo de produção não foi executada. Documentos existentes só receberão os benefícios do novo chunking após reindexação controlada em uma etapa operacional separada.

## Problemas encontrados e correções

| Causa-raiz | Efeito observado | Correção e regressão |
| --- | --- | --- |
| O verificador real podia omitir linhas não factuais apesar de o parser exigir uma classificação para toda unidade | `claim_shape` em respostas corretas | Aceitar arrays esparsos apenas para framing seguro e perguntas de progresso; toda unidade factual ausente falha fechada |
| Confirmações curtas alimentavam a busca com `sim` em vez do assunto ativo | repetição ou recuperação vazia | Construir a consulta com tópico, objetivo, detalhe pendente e mensagem atual |
| Rewrites não reaplicavam integralmente o contrato do modo | modo guiado despejava etapas e modo completo podia terminar com pergunta | Reaplicar o contrato em cada rewrite, limitar guiado e exigir procedimento completo sem pergunta de progresso |
| `respond_social` podia responder a uma pergunta técnica pontual sem fonte | risco de resposta não grounded | Proibir o atalho social para pedidos técnicos focados e exigir fallback literal de uma única versão vigente autorizada |
| Fallback guiado sempre escolhia a primeira etapa | pergunta e estágio repetidos após `sim` | Comparar etapas documentadas com respostas anteriores e avançar para as ainda não apresentadas |
| Remoção de unidade não suportada podia deixar uma lista parcial | procedimento enganoso | Rejeitar procedimentos numerados com pré-requisito removido e retornar fallback seguro |

As correções estão nos commits `afcb5a0`, `dad8da0`, `0a38b0f` e `036f2fa`, acompanhadas por testes em `agent-semantic.test.ts`, `agent-autonomy.test.ts` e `grounding-recovery.test.ts`. Nenhum teste foi removido, nenhum critério esperado foi reduzido e nenhum controle de segurança foi relaxado.

## Validação final

| Verificação | Resultado |
| --- | --- |
| Migrações em banco descartável, duas execuções | Aprovado; segunda execução sem alterações |
| `npm run typecheck` | Aprovado para API e web |
| Testes focados das correções | 37 aprovados, 0 reprovados, 0 ignorados |
| Avaliação real opt-in | 8 aprovados, 0 reprovados, 0 ignorados |
| `npm run build` | Aprovado; API e Vite, 1.578 módulos transformados |
| `npm test` oficial no Windows | 292 executados: 279 aprovados, 11 reprovados, 2 ignorados |
| Avaliação/calibração/baseline RAG | Concluídos; política inalterada |
| `git diff --check` | Aprovado após remoção de whitespace residual |

As 11 falhas da suíte completa são exclusivamente de plataforma: três verificações de scripts Bash e oito verificações do parser por socket Unix retornaram indisponibilidade/EACCES no Windows. Elas não atingem o fluxo alterado pelo PR e devem ser confirmadas pelo workflow Linux. Os dois ignorados são os testes reais quando a suíte geral é executada sem o opt-in; ambos foram aprovados na execução separada autorizada.

## Critérios atendidos e pendências

Atendidos com evidência automatizada e sintética:

- continuidade, identidade da investigação e interpretação de mensagem curta;
- progressão guiada e troca explícita para modo completo;
- resposta direta e grounded para senha operacional padrão;
- preservação de valores, escopo, versão vigente e fonte autorizada;
- ausência de pergunta repetida, aviso parcial e fallback degradado no episódio;
- documento completo, vizinhança de chunks, chunking estrutural e recuperação contextual;
- falha fechada para unidade factual ausente, conflito, versão histórica incorreta, revogação e instrução hostil;
- metadados reprodutíveis e baseline versionado.

Pendências:

- CI Linux verde no SHA final da branch, especialmente para Bash e sockets Unix;
- revisão humana das cinco respostas e dos rótulos de qualidade;
- corpus maior e humanamente revisado antes de qualquer ajuste de limiar;
- eventual reindexação controlada dos documentos existentes, fora deste PR/rodada.

## Arquivos de evidência

- `docs/validation-pr-84-evidence/episode-real-report.json`: respostas, fontes, estados, configuração e proxies por turno;
- `docs/validation-pr-84-evidence/calibration-cases.json`: piloto e holdout sintéticos;
- `docs/validation-pr-84-evidence/calibration-result.json`: políticas, métricas e decisão de não aplicar;
- `docs/validation-pr-84-evidence/ai-reviewed-turns.json`: rótulos explícitos de IA;
- `docs/validation-pr-84-evidence/ai-review-summary.json`: métricas conversacionais agregadas;
- `docs/validation-pr-84-evidence/episode-baseline.json`: baseline, hash e critérios automatizados.

## Conclusão

Não foi identificada regressão funcional remanescente no escopo do PR. O código avaliado está pronto para integração **desde que o novo CI Linux fique verde**. A revisão humana conversacional deve ser concluída para homologar a qualidade, mas não invalida a evidência automatizada nem autoriza declarar os rótulos de IA como humanos. O merge permanece deliberadamente não executado.
