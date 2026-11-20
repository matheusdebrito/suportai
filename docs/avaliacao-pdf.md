# Validação adversarial de PDFs — SuportAI

## Limites implementados

O extrator usa um processo filho Node com heap de 192 MB, saída de 2 MB e limite de execução (25 s por padrão). O leitor restringe a 8 MB, 200 páginas e 450 mil caracteres extraídos. O worker só publica documentos após revisão humana e indexação concluída.

O teste `apps/api/src/pdf-extract.test.ts` inclui PDF válido, sem texto, quantidade de páginas excedida, payload acima do limite, cabeçalho forjado com estrutura malformada e PDF com ação JavaScript embutida. Todos usam arquivos sintéticos e a execução é feita em CI.

## Riscos residuais — não considerar isolamento de sistema operacional

**O processo filho não é um sandbox de SO**. Ainda precisa de implantação com contenção robusta para arquivos não confiáveis (sem acesso a segredos, sem rede desnecessária, usuário não privilegiado, filesystem somente leitura, cgroups/seccomp/apparmor e atualizações do parser).

Antes de produção com arquivos internos, executar amostras controladas de PDF criptografado com senha, anexos/JavaScript, PDFs corrompidos, objetos recursivos e consumo de recursos em um ambiente isolado. Arquivos reais desconhecidos não devem ser usados para testar este sistema sem uma autorização e ambiente apropriados.

## Checklist de verificação

- [x] Testes sintéticos automatizados dos casos descritos acima.
- [x] PDF autenticamente criptografado (arquivo sintético legítimo) em processo filho, com validação API/Chromium; isolamento de SO continua pendente.
- [x] PDF com ação URI apontando para servidor-canário local: extração não fez nenhuma requisição. **Isso não comprova bloqueio de rede pelo SO**; ainda é necessário teste de rede isolada no host de produção.
- [ ] Validar limites de CPU e memória no sistema operacional escolhido.
- [ ] Avaliar e corrigir alertas de dependências do parser.
- [ ] Teste de recuperação de worker sob falha/timeout no ambiente de implantação.

Rastreabilidade: T028/T031, REQ-012/REQ-022, AC-009/AC-015.
