# Etapa 3 — baseline histórico e ampliado

Data: 27 de novembro de 2026

Revisão: IA técnica. Homologação humana: pendente.

## Episódio histórico de telefone

O relatório histórico do commit `036f2fa` foi preservado. O HEAD pré-correção foi executado três vezes com o mesmo modelo (`gpt-4.1-mini`), embeddings (`text-embedding-3-small`), temperatura (`0.2`), limites e artigo sintético.

| Rodada | Turnos persistidos | Primeiro turno | Segundo turno | Completa |
| --- | ---: | --- | --- | --- |
| 1 | 2 | `unsafe_answer` | interpretação semântica inválida | não |
| 2 | 2 | `unsafe_answer` | interpretação semântica inválida | não |
| 3 | 2 | `clarified` | interpretação semântica inválida | não |

A falha de continuidade ocorreu em 3/3 rodadas no segundo turno (`sim`). O primeiro turno variou entre abstenção e esclarecimento, mas nenhuma execução chegou aos cinco turnos.

O comparador confirmou equivalência de configuração e recusou a comparação quantitativa por diferença nas mensagens observadas: cinco no histórico e duas no HEAD. Todos os deltas ficaram `null`; não foram convertidos em zero. Os relatórios atuais têm telemetria apenas no primeiro turno capturado, enquanto o histórico não possui telemetria por turno, então redução de latência, tokens ou rejeições não pode ser declarada.

## Baseline conversacional ampliado

A matriz inicial do HEAD preserva nove episódios e 26 turnos, com 55 checks falhos. Junto dos cinco turnos tentados no episódio histórico, a implementação contém os 10 episódios e 31 turnos declarados. A matriz mede o estado pré-correção; não é homologação.

## Baseline RAG v2

O runner usa o pool candidato rotulado de cada caso de forma isolada. Um ensaio anterior que misturou todos os documentos foi marcado `valid=false`, preservado para rastreabilidade e excluído do baseline.

| Métrica | Piloto (60) | Holdout (40) |
| --- | ---: | ---: |
| Recall@5 | 0,9083 | 0,9500 |
| Precisão sobre retornados | 0,6722 | 0,6008 |
| Precisão com denominador 5 | 0,1933 | 0,1950 |
| MRR | 0,8917 | 0,8792 |
| Cobertura de chunks | 0,9083 | 0,9500 |
| Versão vigente correta | 1,0000 | 1,0000 |
| Documentos fora do pool | 0 | 0 |

A diferença entre as duas precisões é intencional: a primeira segue o avaliador existente e divide pelos resultados realmente devolvidos; a segunda usa denominador fixo 5. O reranker pode devolver menos de cinco itens.

O piloto identificou linguagem informal como causa dominante: Recall@5 e MRR 0,60. Também houve um caso de versão vigente ausente e um caso multiobjetivo com cobertura parcial. Parte dos relevantes informais não passou pelo piso SQL de similaridade `0,45`; outros chegaram aos candidatos, mas ficaram abaixo do limiar de reranking `0,56`.

## Scores, latência e consumo

- candidatos observados: 188;
- similaridade semântica: mínimo 0,2344; mediana 0,4715; p95 0,6497; máximo 0,7363;
- latência de consulta/reranking, sem embedding: piloto média 3,37 ms, mediana 3,08 ms e p95 4,52 ms; holdout média 3,12 ms, mediana 3,02 ms e p95 4,15 ms;
- embeddings: cinco chamadas em lote e 5.898 tokens reportados pelo provedor;
- chat no baseline RAG: não utilizado;
- custo monetário: não informado pelo provedor; nenhuma estimativa foi apresentada como faturamento.

## Segurança

Os 20 casos de segurança foram executados separadamente. Nenhum documento restrito ou revogado foi retornado pela recuperação. Casos de prompt injection, segredo, conflito e invenção ainda exigem avaliação do loop completo na validação final; a métrica desta etapa comprova somente a fronteira de recuperação.

## Conclusão

O baseline foi estabelecido antes das correções. As oportunidades justificadas para a Etapa 4 são: tornar o contrato semântico condicional robusto para continuidade real e avaliar, no piloto, um alargamento controlado da recuperação semântica para consultas informais. O holdout não será usado para escolher a política e será consultado somente após a seleção no piloto.
