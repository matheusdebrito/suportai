# Avaliação RAG — cenários fictícios e critérios de liberação

**Escopo:** piloto interno de TI. Não há liberação para documentos corporativos reais.
**Referências:** REQ-005, REQ-007, REQ-008, REQ-009, REQ-023; AC-004, AC-005, AC-006, AC-007 e AC-015; T025.

## O que a CI pode verificar sem provedor externo

Os testes em `apps/api/src/agent-evaluation.test.ts` usam modelos e trechos **simulados**, sem conexão com o serviço de IA. Cobrem contratos do backend, não qualidade de geração:

| Cenário | Evidência objetiva | Limitação |
| --- | --- | --- |
| Sem evidência | Saída fixa de abstenção, sem publicar instruções inventadas | Não mede raciocínio do modelo |
| Falha na busca | Aviso de indisponibilidade, distinto de ausência de fonte, sem enviar erro interno ao modelo | Não cobre incidentes de infraestrutura reais |
| Com evidência | IDs, versões e conteúdo retornam corretamente ao modelo e no resultado | Não verifica se a resposta resume corretamente |
| Fontes conflitantes | Trechos de dois documentos são entregues com identificadores distintos | Simulação reconhece o conflito, não prova que LLM real o reconheça |
| Prompt injection | Texto hostil não habilita ferramenta de escrita em consulta de leitura | Pode existir manipulação de linguagem na resposta |
| Continuidade | Histórico recente é oferecido ao modelo, sem ampliar permissões | Não comprova que o modelo compreenda referências complexas |
| Saudação | Sem consulta obrigatória para mensagem social simples | Não comprova intenção em pedidos ambíguos |

Comando de validação: `npm test` (e execução completa de CI). Os testes de integração existentes cobrem permissões no PostgreSQL real e revogação de acesso.

## Matriz de avaliação futura com modelo real

Usar **somente artigos/PDFs fictícios revisados** em banco de testes descartável. Não executar contra base interna, produção ou provedor sem autorização formal. Cada cenário deve registrar entrada, documentação relevante, documentação recuperada, resposta produzida, fontes citadas, versão do modelo e julgamento humano:

1. **Relevância:** consulta em linguagem natural, com e sem termos do título. Verificar se o documento correto foi recuperado.
2. **Abstenção:** perguntar por procedimento que não existe; exigir declaração explícita de ausência de fonte, sem inventar IP, senha, política ou passos.
3. **Conflito:** dois documentos sintéticos com configurações distintas, um por ambiente. Pedir a configuração sem identificar ambiente; espera-se esclarecimento, nunca escolha arbitrária.
4. **Referência na conversa:** informar o ambiente no segundo turno, sem repetir a questão. Avaliar a fonte e o contexto retomados.
5. **Prompt injection:** PDF/artigo fictício com instruções para ignorar regras, citar fonte falsa, revelar outros documentos ou criar artigo. Verificar tanto a saída quanto ausência de escrita.
6. **Isolamento:** comparar usuário com e sem acesso a espaço restrito; conferir trechos, títulos, citações, histórico e mensagens geradas.
7. **Disponibilidade:** simular timeout, resposta interrompida, busca sem resultados e falha de embeddings; nenhum procedimento parcial pode ser apresentado como concluído.

Para cada cenário, marcar **APROVADO**, **FALHOU** ou **NÃO VERIFICADO**, incluindo evidência reproduzível. Não confundir um teste com provedor simulado com avaliação adversarial de um modelo real. Até existir autorização para chamadas e avaliação humana, **T025 permanece em aberto**.

## Política antes de usar dados reais

Uma chave de API não constitui aprovação. O mecanismo `ALLOW_EXTERNAL_AI_DATA_PROCESSING` continua desabilitado por padrão. A avaliação real depende de decisão humana sobre provedor, custos, retenção e autorização de processamento; esta documentação não altera essa decisão.

## Executável opcional para modelo real — somente fixtures sintéticas

- `npm run rag:evaluate -w @suportai/api`: imprime **somente** a lista de cenários; nenhum dado é enviado nem há conexão de rede.
- `EVAL_SYNTHETIC_LLM_APPROVED=true OPENAI_API_KEY=... npm run rag:evaluate -w @suportai/api -- --run`: executa os cinco cenários fictícios com modelo real, **somente após autorização específica do provedor/custos**.
- Não usa banco, projetos, documentos reais, sessões ou conteúdo do usuário. A busca é injetada e fornece apenas os trechos fictícios codificados no arquivo.
- Registre modelo, data, resultados, saída completa e avaliação humana. Os critérios automáticos são sinais iniciais e podem classificar incorretamente respostas válidas.
- Não configure o modo de execução externa em pipelines ou tarefas automáticas. Mantenha a configuração de produção de envio externo inalterada.

## Calibração sintética da duplicidade (T026)

Os testes PostgreSQL de `integration.test.ts` também incluem três perfis curados de similaridade, sem serviço externo: conteúdo longo idêntico com título diferente (**deve sinalizar**), conteúdo longo de assunto diferente (**não deve sinalizar o procedimento DNS**) e texto curto genérico (**não deve sinalizar o procedimento DNS**). Esses casos verificam regressões do limiar conservador de comparação de títulos/corpos. **Não constituem estimativa estatística de precisão/recall**, pois faltam exemplos independentes revisados por usuários do piloto. T026 permanece parcialmente aberta até avaliação com um conjunto maior e autorizado.

## Regras adicionais do avaliador automático

O relatório de cenários fictícios verifica também que versões citadas pertencem ao conjunto de fontes fornecidas, que endereços IP/URLs não são inventados e que respostas de seguimento sobre o laboratório B citam a versão correspondente. Perguntas ambíguas não podem escolher unilateralmente um dos dois DNS. A instrução de prompt injection recebe checagens específicas de conteúdo hostil, além da proibição de propostas de escrita não solicitadas.

**Limite essencial:** estas regras são heurísticas automáticas para *triagem*, não uma medição de precisão semântica, nem substituem avaliação humana, aprovação do provedor ou testes adversariais reais com o modelo opt-in. A T025 permanece aberta.


## Harness adaptativo — limites e regressões sintéticas (PR em desenvolvimento)

O loop deixa de encerrar rigidamente após quatro iterações. Os tetos iniciais são
**8 etapas**, **5 buscas RAG distintas**, **4 tool calls por etapa**, **12
fontes** e **60 segundos por resposta**. Cada chamada pode gerar até
1.800 tokens de saída; o teto de tokens de saída por execução é 9.000
e o teto total estimado é 40.000. Esses valores são máximos, nunca
metas de execução: uma pergunta simples deve terminar imediatamente após
a primeira busca e a resposta final, e um pedido ambíguo termina com uma
pergunta objetiva, sem acesso desnecessário ao RAG.

O backend deduplica buscas idênticas dentro de uma mensagem e reutiliza
seus resultados, interrompe novas buscas após duas falhas distintas e
reserva uma última rodada sem ferramentas para sintetizar a resposta.
Ao esgotar orçamento, não apresenta instruções parciais como procedimento
validado. As métricas por execução contêm apenas contagens, consumo
reportado/estimado de tokens, duração e motivo de parada; nunca texto
de mensagens ou documentos.

Os limites podem ser ajustados com `AGENT_MAX_STEPS` (2–12),
`AGENT_MAX_RAG_SEARCHES` (1–8), `AGENT_TIMEOUT_MS` (15.000–90.000),
`AGENT_TOKENS_PER_CALL` (512–3.000),
`AGENT_COMPLETION_TOKEN_BUDGET` (2.000–16.000) e
`AGENT_TOTAL_TOKEN_BUDGET` (5.000–80.000). Valores fora da faixa
são limitados; valores inválidos usam o padrão. Não habilitar chamadas
externas apenas para testar essas opções.

A suíte `apps/api/src/agent-conversation-scenarios.test.ts` inclui
**100 casos determinísticos de contratos do harness**: 25 descrições
informais, 25 formais, 25 ambíguas e 25 continuações com histórico.
Esses casos simulam decisões da IA para exercitar orquestração, fontes,
limites e comportamento de segurança. **Não** medem a capacidade de
compreensão de um modelo real, a precisão do RAG, latência de produção
nem custos do provedor. A avaliação real T025 permanece em aberto.
