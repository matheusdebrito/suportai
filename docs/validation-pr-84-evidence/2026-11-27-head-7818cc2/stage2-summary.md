# Etapa 2 — corpus ampliado de calibração do RAG

Data: 27 de novembro de 2026

Revisão: IA técnica. Revisão humana: pendente.

## Resultado

Foi congelado o corpus `suportai-rag-calibration-v2`, composto exclusivamente por fixtures sintéticas e reproduzível pelo comando:

```text
npm run rag:corpus -w @suportai/api -- <arquivo-de-saída>
```

O snapshot versionado contém 100 casos positivos, 120 documentos e 20 casos separados de segurança/abstenção.

| Categoria positiva | Casos |
| --- | ---: |
| Procedimentos técnicos | 20 |
| Diagnóstico de problemas | 15 |
| Linguagem informal e variações | 15 |
| Documentos semanticamente semelhantes | 15 |
| Procedimentos longos e pré-requisitos | 10 |
| Informações parciais | 10 |
| Versões conflitantes | 10 |
| Consultas com múltiplos objetivos | 5 |

## Independência dos conjuntos

- piloto: 60 casos;
- holdout: 40 casos;
- segurança: 20 casos fora das métricas positivas.

Cada positivo possui família exclusiva. Famílias e documentos candidatos não aparecem nas duas divisões. O gerador e os testes impedem interseção de candidatos entre piloto e holdout. O holdout ainda não foi usado para selecionar parâmetros.

## Rótulos e cobertura

Cada caso registra ID e família estáveis, categoria, domínio, divisão, consulta, documentos candidatos, documentos relevantes, chunks relevantes, comportamento esperado, justificativa e risco. Procedimentos longos exigem todos os chunks rotulados; versões conflitantes incluem versão histórica como distrator e esperam somente a vigente; consultas multiobjetivo exigem dois documentos relevantes.

O corpus cobre telefonia, impressoras, computadores, redes, Wi-Fi, DNS, DHCP, scanners, RIS, ERP, PACS, instalações, configurações, diagnóstico, permissões e acessos.

## Segurança e abstenção

A suíte separada contém dois casos de cada risco:

- documento não autorizado;
- conteúdo restrito;
- documento revogado;
- prompt injection;
- credenciais pessoais;
- tokens e segredos;
- ausência de conhecimento relevante;
- fontes incompatíveis;
- conflito sem resolução;
- indução de procedimento inventado.

Esses casos têm `split=security` e listas vazias de relevantes esperados, para que abstenções corretas não sejam inseridas artificialmente em Recall@5, Precision@5 ou MRR.

## Validação

- `rag-calibration-corpus-v2.test.ts`: 2 aprovados, 0 reprovados;
- typecheck da API: aprovado;
- snapshot regenerado com as contagens esperadas;
- nenhuma alteração de limiar de produção foi feita.

O corpus recebeu revisão técnica por IA para consistência de rótulos, riscos, isolamento e cobertura. Isso não é revisão humana.
