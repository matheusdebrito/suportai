# Especificação funcional — Agente de IA com cérebro de conhecimento

**Identificador:** `001-agente-corporativo-conhecimento`  
**Versão:** `0.7`  
**Data:** `20/11/2026`  
**Status:** `EM VALIDAÇÃO — decisões do MVP incorporadas; pendências registradas`  
**Destino previsto no repositório:** `specs/001-agente-corporativo-conhecimento/spec.md`  

> Este documento descreve o comportamento desejado. Não representa implementação concluída nem aprovação de todos os detalhes. Foram verificadas apenas as cópias locais desta especificação; não houve acesso a repositório de código ou a arquivo de constituição (`.specify/memory/constitution.md`). As decisões de 20/11/2026 foram incorporadas com base nas respostas do solicitante.

## 1. Contexto

O projeto é uma ferramenta interna e simples de consulta e manutenção do conhecimento, destinada inicialmente à equipe de Tecnologia da Informação. O agente deve orientar procedimentos, responder a dúvidas e apoiar diagnósticos usando artigos e PDFs aprovados, sem revelar informações não autorizadas. A expansão para outras áreas pode acontecer depois, sem impor complexidade organizacional ao MVP.

O conhecimento será administrado em uma interface e também por comandos em linguagem natural ao agente. A publicação de informações oficiais exige fluxo de revisão e permissão humana; o agente não pode transformar conversas em conhecimento oficial por conta própria.

## 2. Objetivo e resultados esperados

- Facilitar a localização de procedimentos e a resolução orientada de dúvidas de qualquer setor.
- Permitir a manutenção da base de conhecimento por usuários autorizados, por painel ou por conversa.
- Garantir rastreabilidade de origem, revisão e validade do conhecimento consultado.
- Respeitar restrições por usuário, departamento, espaço de conhecimento e, quando necessário, por documento.
- Começar com um único agente, piloto em TI e infraestrutura simples, priorizando segurança e confiabilidade em vez de gestão corporativa complexa.

## 3. Decisões e premissas

| ID | Estado | Decisão ou premissa | Justificativa / impacto |
|---|---|---|---|
| DEC-001 | **VALIDADO** | O produto atende **uma empresa**, com vários departamentos. | Não introduzir multiempresa. |
| DEC-002 | **VALIDADO** | Um **agente central** conversa e consulta conhecimento de áreas distintas. | Evita multiplicar agentes por setor. |
| DEC-003 | **VALIDADO** | Há conhecimento **universal**, **corporativo compartilhado** e **setorial/restrito**. | Organiza origens e permissões. |
| DEC-004 | **VALIDADO** | Usuários autorizados podem criar e atualizar conhecimento no painel e solicitar isso ao agente. | Gestão conversacional faz parte do MVP. |
| DEC-005 | **VALIDADO** | Novo conhecimento e alterações de conteúdo oficial passam por revisão humana autorizada antes de publicação. | Evita autoproclamação de respostas como fontes oficiais. |
| DEC-006 | **VALIDADO** | O agente poderá futuramente sugerir artigos quando uma conversa resolver um incidente; não publica automaticamente. | Fase posterior, reaproveitando o fluxo de revisão. |
| DEC-007 | **ASSUMIDO** | Usuários podem pertencer a mais de um departamento. | Suporta funções compartilhadas, sujeito a confirmação. |
| DEC-008 | **ASSUMIDO** | Documentos somente entram na busca oficial após sua versão ser publicada. | Reduz resposta com rascunhos ou conhecimento não validado. |
| DEC-009 | **ASSUMIDO** | A primeira experiência é via interface web corporativa. | WhatsApp, Teams e outros canais ficam fora do MVP. |
| DEC-010 | **VALIDADO** | O MVP terá **login próprio**, com credenciais gerenciadas pela aplicação, sem SSO inicial. | Simplifica o piloto; criação de contas restrita a administradores (DEC-015); redefinição de senha exclusivamente por administrador e troca obrigatória no acesso seguinte (DEC-017). |
| DEC-011 | **VALIDADO** | Haverá um perfil de **Aprovador de Conhecimento**, com autorização de revisão/publicação limitada aos espaços concedidos. | Aprovação não deriva automaticamente da condição de gestor ou administrador. |
| DEC-012 | **VALIDADO** | O piloto inicial atenderá somente **Tecnologia da Informação**. | A estrutura mantém suporte futuro a outros setores; os testes reais iniciais usam TI. |
| DEC-013 | **VALIDADO** | O MVP aceitará **artigos estruturados e arquivos PDF** como fontes de conhecimento. | Outros formatos ficam fora do primeiro escopo; PDF digitalizado exige decisão específica. |
| DEC-014 | **VALIDADO** | O **Aprovador de Conhecimento pode aprovar/publicar artigos de sua própria autoria**, se tiver permissão de aprovação no espaço. | O fluxo padrão permite autoaprovação humana; a necessidade de dupla aprovação para conteúdos especialmente sensíveis permanece aberta. |
| DEC-015 | **VALIDADO** | **Somente administradores** podem criar contas de usuários e atribuir, alterar ou revogar permissões. Não há cadastro público nem autoinscrição no MVP. | Centraliza o provisionamento; recuperação por administrador definida em DEC-017. |
| DEC-016 | **VALIDADO** | Conhecimento **universal** e **corporativo compartilhado** pode ser consultado por qualquer usuário autenticado e ativo. Conhecimento **restrito**, inclusive setorial ou corporativo não compartilhado, exige autorização específica. | Estabelece a política padrão de leitura; o sistema deve filtrar busca, documentos, citações e respostas sem depender do julgamento do modelo. |
| DEC-017 | **VALIDADO** | No MVP, **somente um administrador pode iniciar a redefinição de senha** de um colaborador. O colaborador deve definir uma nova senha ao realizar o próximo acesso; não haverá recuperação por e-mail nem autoatendimento neste momento. | Centraliza a recuperação de acesso e exige controle de sessão, força de troca de senha e trilha de auditoria. |
| DEC-018 | **VALIDADO** | **Priorizar a segurança e a confiabilidade do agente e do cérebro acima de regras administrativas e classificações adicionais.** O MVP usa as categorias já definidas: compartilhado e restrito. | Evita sobreengenharia. A proteção de informações sensíveis, a autorização, a validação de fontes e os testes de falha continuam obrigatórios. |

## 4. Público e papéis

- **Colaborador:** consulta conteúdos permitidos e pode propor novos artigos e correções, mas não publica.
- **Editor de conhecimento:** cria e edita rascunhos nos espaços em que possui permissão.
- **Aprovador de Conhecimento:** perfil específico que analisa propostas, solicita ajustes, rejeita e aprova/publica **nos espaços explicitamente autorizados**.
- **Gestor de conhecimento:** organiza o conteúdo e os responsáveis do seu espaço; só pode aprovar/publicar se também possuir concessão de Aprovador de Conhecimento.
- **Administrador:** gerencia usuários, setores, espaços e concessões de acesso; não recebe automaticamente poderes para ler conteúdo sigiloso nem para publicar, sem a permissão correspondente.

**Regra transversal:** o papel do usuário não substitui a permissão sobre o espaço ou documento. O servidor deve avaliar ambos. Um gestor de TI não recebe automaticamente acesso a registros restritos do RH. O **Aprovador de Conhecimento pode aprovar artigos de sua própria autoria** quando possui permissão de aprovação no espaço (DEC-014 / Q-003). Não se exige um segundo aprovador no fluxo padrão; regras editoriais adicionais por categorias de sigilo ficam fora do MVP (Q-006).

**Política de leitura (DEC-016):** todo usuário autenticado e ativo pode consultar versões publicadas dos espaços universais e corporativos explicitamente compartilhados. O acesso a espaços ou documentos marcados como restritos requer concessão específica e verificável no servidor. Estar autenticado ou citar o nome do setor não concede acesso a dados restritos. Detalhes de como o administrador delega acesso podem ser definidos no planejamento, sem reduzir essas garantias.

**Piloto:** os usuários reais da primeira versão serão do setor de Tecnologia da Informação, embora os conceitos de departamento e espaço tenham de suportar expansão.

## 5. Jornadas e cenários de usuário

### JOR-01 — Consulta contextualizada

1. Colaborador autenticado faz uma pergunta no chat.
2. O agente identifica se a resposta depende de conhecimento da base.
3. O sistema recupera somente conteúdo publicado: universal e corporativo compartilhado para qualquer usuário autenticado e ativo; conteúdo restrito apenas para quem possui autorização específica.
4. O agente responde em linguagem natural, com referências rastreáveis quando usa o cérebro.
5. Se houver lacunas, conflito entre procedimentos ou variação por versão, solicita detalhes ou informa a incerteza.

### JOR-02 — Criação de artigo pelo chat

1. Colaborador solicita: "Adicione ao cérebro este procedimento".
2. Sistema verifica se pode propor conteúdo no espaço informado; se faltar espaço, pergunta ou oferece apenas destinos permitidos.
3. Agente organiza a proposta (título, finalidade, pré-requisitos, passos, validação e fontes, quando aplicáveis).
4. Mostra prévia e pede confirmação explícita para registrar a proposta.
5. Sistema grava sugestão ou rascunho com autoria, espaço, origem e histórico, sem publicá-la.
6. Usuário com perfil **Aprovador de Conhecimento**, autorizado para o espaço, analisa, solicita ajuste, rejeita ou aprova/publica.
7. A versão publicada passa a estar disponível somente para usuários permitidos.

### JOR-03 — Atualização por conversa

1. Usuário pede a alteração de um artigo existente.
2. Sistema verifica acesso ao artigo e permissão de propor/editar no seu espaço.
3. Agente identifica a versão atual, apresenta diferenças e pede confirmação.
4. Alteração gera **nova versão em revisão**, mantendo o conteúdo publicado anterior até a nova aprovação ou arquivamento deliberado.
5. Aprovador de Conhecimento autorizado decide; a plataforma preserva histórico e autoria.

### JOR-04 — Administração do conhecimento no painel

1. Usuário autorizado cria artigo estruturado ou envia um PDF.
2. Sistema valida arquivo, metadados, escopo e permissão.
3. Conteúdo fica em rascunho/em processamento, não publicado.
4. Aprovador de Conhecimento autorizado confere o conteúdo extraído, classifica o documento e publica quando adequado.
5. Documento aprovado fica pesquisável no escopo autorizado.

### JOR-05 — Consulta entre setores

Todos os colaboradores autenticados podem consultar conhecimento universal e corporativo compartilhado. Um profissional com acesso autorizado a TI e suporte pode consultar também os dois conjuntos restritos na mesma conversa. Um usuário sem acesso ao RH não pode receber trechos, nomes de documentos, resumos, citações ou respostas baseados em material restrito do RH.

### JOR-06 — Mudança de permissão

Depois que um usuário perde acesso a um espaço, consultas novas, retomada de conversas e reutilização de memória não podem expor novamente conteúdos daquele espaço. O tratamento de mensagens históricas já exibidas ou armazenadas exigirá política de retenção específica (questão em aberto).

### JOR-07 — Redefinição de senha por administrador

1. Um colaborador que perdeu sua senha solicita apoio ao administrador por um canal corporativo apropriado.
2. Após verificar a identidade do colaborador, o administrador autenticado solicita a redefinição na interface administrativa.
3. O sistema invalida o acesso anterior conforme a política de sessão e disponibiliza um meio temporário e protegido para o colaborador realizar a troca. O formato exato desse meio será definido no planejamento técnico, sem revelar a senha anterior.
4. Ao autenticar com o mecanismo temporário válido, o colaborador é obrigado a criar uma nova senha antes de usar chat, conhecimento ou administração.
5. O sistema conclui a troca, invalida o mecanismo temporário e registra a redefinição sem registrar credenciais.

## 6. Requisitos funcionais

### Identidade e autorização

- **REQ-001:** O MVP deve oferecer **login próprio com credenciais locais**, entrada e saída de sessão e controle de conta ativa. Somente usuários autenticados podem acessar o produto; credenciais incorretas, contas desativadas e sessões inválidas/expiradas não executam consultas privadas nem alterações. O cadastro de contas e a redefinição administrativa de senha são exclusivos de administradores, sem autoinscrição nem recuperação autônoma de senha no MVP (Q-010).
- **REQ-002:** A administração pode cadastrar, editar e desativar departamentos e associar usuários a um ou mais deles. **No piloto, apenas Tecnologia da Informação terá uso real**, sem impedir expansão posterior.
- **REQ-003:** O produto deve disponibilizar conhecimento universal, corporativo compartilhado e restrito (setorial ou corporativo restrito), com sinalização clara de visibilidade. O escopo e a restrição devem ser preservados ao editar, publicar e consultar documentos.
- **REQ-004:** Toda consulta de conteúdo, arquivo, resultado de busca, referência, versão e alteração deve validar permissões **no servidor**, usando a identidade autenticada; instruções fornecidas ao modelo ou pelo navegador não podem ampliar esse escopo.
- **REQ-005:** A retirada de permissões deve impedir novas consultas e novo uso de conteúdo anteriormente recuperado como contexto do agente.

- **REQ-027:** Somente administradores autenticados e autorizados podem criar usuários e atribuir, alterar ou revogar seus papéis e permissões. Tentativas feitas por outros perfis, via interface, API ou chat, devem ser negadas; não deve existir fluxo de cadastro público no MVP. Toda operação administrativa deve ser auditada.

- **REQ-028:** Todo usuário autenticado e ativo deve poder ler o conhecimento universal e o corporativo explicitamente compartilhado. A leitura de conteúdo restrito deve exigir concessão específica, negando acesso por padrão sem ela. A verificação deve proteger busca, trechos recuperados, documentos, metadados, citações, respostas do agente e reutilização de contexto, inclusive quando a consulta ocorrer via API ou ferramenta do agente.

- **REQ-029:** No MVP, somente administradores autenticados e autorizados podem iniciar redefinição de senha de contas de colaboradores. Após a redefinição, a conta deve exigir que o titular crie nova senha no próximo acesso, antes de permitir uso normal do sistema. O mecanismo provisório deve ser de uso controlado e não reutilizável após a troca; sessões anteriores precisam ser invalidadas para impedir persistência de acesso indevido. As operações devem ser auditadas sem expor senhas, tokens ou outros segredos. Não haverá fluxo de recuperação autônoma por e-mail no MVP.

### Consulta e conversação

- **REQ-006:** O agente deve receber mensagens em linguagem natural, manter continuidade da conversa e permitir perguntas de esclarecimento.
- **REQ-007:** Quando uma pergunta depender da base, o sistema deve recuperar somente fontes relevantes e publicadas visíveis ao usuário, combinando conhecimento universal e corporativo compartilhado com conteúdo restrito especificamente autorizado, quando necessário.
- **REQ-008:** Respostas que utilizem a base devem apresentar referências identificáveis aos documentos/versões consultados e distinguir instruções internas de explicações gerais do modelo.
- **REQ-009:** Quando não houver evidência suficiente, houver conflito material entre fontes ou a versão relevante não puder ser determinada, o agente deve explicitar a limitação e pedir dados adicionais quando útil, sem inventar um procedimento corporativo.
- **REQ-010:** O agente deve poder conduzir conversa simples sem exigir uma busca a cada mensagem.

### Gestão e importacao de conhecimento

- **REQ-011:** Usuários com permissão adequada podem criar artigos estruturados pelo painel e informar título, espaço, descrição, passos, pré-requisitos, verificação e fontes quando cabíveis.
- **REQ-012:** O MVP aceita **somente artigos estruturados e arquivos PDF** como fontes do cérebro. PDFs enviados por usuários autorizados devem passar por validação, processamento e revisão antes de publicação; outros tipos de arquivo são recusados explicitamente. O tratamento de PDFs escaneados permanece em aberto (Q-012).
- **REQ-013:** O sistema deve manter metadados de autoria, escopo, revisão, versão, data e estado editorial para cada artigo/documento.
- **REQ-014:** O usuário deve poder propor criação de conhecimento pelo chat; o agente prepara uma prévia e só registra após confirmação explícita do usuário.
- **REQ-015:** O usuário deve poder propor atualização pelo chat; o agente deve identificar o artigo alvo, apresentar as mudanças e preservar a versão publicada até a aprovação da nova.
- **REQ-016:** O agente deve pesquisar artigos potencialmente duplicados antes de uma nova criação e oferecer reutilizar/atualizar um existente, sem impedir criações legitimamente diferentes.

### Revisão, publicação e ciclo de vida

- **REQ-017:** Deve existir uma fila de revisão em painel, visível somente aos usuários com perfil de **Aprovador de Conhecimento** e autorização específica para cada espaço.
- **REQ-018:** Somente usuários com perfil **Aprovador de Conhecimento** e acesso de aprovação ao espaço podem aprovar/publicar, rejeitar ou solicitar ajustes, sempre com registro de justificativa e auditoria. **O aprovador pode aprovar artigos criados por ele mesmo**; a ação humana explícita de aprovação continua obrigatória, mesmo quando o próprio autor tem esse perfil. Ser gestor ou administrador, isoladamente, não concede publicação.
- **REQ-019:** Somente versões publicadas e não arquivadas são usadas nas respostas oficiais do cérebro; revisões e rascunhos não podem aparecer como fontes publicadas.
- **REQ-020:** A publicação de nova versão preserva histórico e torna explícita a versão vigente; edições de conteúdo publicado são feitas em revisões, e não por sobrescrita silenciosa.
- **REQ-021:** A autorização de propor, editar, revisar e publicar deve ser definida por papel **e** por espaço/documento, aplicando negação por padrão. O perfil **Aprovador de Conhecimento** deve ser concedido e revogado explicitamente, sem confiar em uma indicação fornecida pelo chat ou pelo navegador.

### Segurança, qualidade e operação

- **REQ-022:** O sistema deve detectar e interromper a inclusão inadvertida de credenciais e segredos em material destinado a publicação; suspeitas de dados sensíveis exigem tratamento/revisão antes da disponibilização.
- **REQ-023:** Conteúdos importados e recuperados devem ser tratados como dados, não como comandos capazes de alterar regras, permissões ou ferramentas do agente.
- **REQ-024:** O sistema deve registrar eventos auditáveis de criação, alteração, aprovação, rejeição, publicação, arquivamento e alterações de permissão, sem armazenar segredos em logs.
- **REQ-025:** Usuários devem conseguir registrar feedback sobre respostas e vinculá-lo, quando aplicavel, as fontes utilizadas para revisão do conhecimento.
- **REQ-026:** Falha na ingestão, no modelo ou na busca não deve publicar conteúdo parcial nem apresentar sucesso indevido; a interface deve mostrar estado e permitir nova tentativa segura.

## 7. Fluxo editorial

Estados minimos sugeridos: `RASCUNHO` -> `EM_REVISAO` -> `PUBLICADO`; uma revisão também pode voltar para `AJUSTES_SOLICITADOS` ou `REJEITADO`; conteúdo vigente pode ser `ARQUIVADO`.

- Rascunho ou sugestão não significa conhecimento oficial.
- Uma proposta criada no chat é atribuída ao autor autenticado, nunca ao modelo como titular de permissões.
- Aprovar/publicar é uma **ação humana autorizada de um Aprovador de Conhecimento** com acesso ao espaço. A IA pode preparar a ação, mas não executa aprovação independente.
- Alterações em versões publicadas devem criar versões separadas e revisáveis.
- **Autoaprovação permitida:** o Aprovador de Conhecimento pode revisar e aprovar o artigo de sua autoria no espaço autorizado; autoria não confere permissão de aprovação a outros papéis. A decisão humana de publicar deve ser explícita e auditável.
- **FORA DO MVP (Q-006):** não criar níveis adicionais de classificação nem exigir revisão independente por categoria; manter proteção técnica a segredos e dados pessoais.

## 8. Critérios de aceitação rastreáveis

| ID | Requisitos | Critério observável |
|---|---|---|
| **AC-001** | REQ-001, REQ-004 | Com credenciais locais válidas e conta ativa, o usuário acessa uma sessão; com credenciais erradas, conta desativada, sessão ausente ou expirada, tentativas de ler documento privado, consultar chat privado ou criar rascunho são recusadas. |
| **AC-002** | REQ-002, REQ-003, REQ-021 | Em dados de teste, usuário vinculado a dois setores consulta somente espaços permitidos, e um espaço restrito não se torna acessível apenas por conhecer seu identificador; no piloto real, só TI estará habilitado. |
| **AC-003** | REQ-004, REQ-007, REQ-008 | Em consulta sobre dois espaços autorizados, resposta pode citar ambos; conteúdo de espaço não autorizado nunca aparece em resultados, citações ou resposta. |
| **AC-004** | REQ-005, REQ-006 | Após revogação de acesso, continuar conversa anterior não pode reutilizar trechos privados para gerar novas respostas. |
| **AC-005** | REQ-006, REQ-010 | O agente responde a saudação e retoma referência a uma pergunta anterior sem necessariamente executar busca. |
| **AC-006** | REQ-007, REQ-008, REQ-019 | Resposta baseada em procedimento publicado aponta documento e versão corretos; rascunho com o mesmo tema não é citado como oficial. |
| **AC-007** | REQ-009 | Sem fonte interna adequada, agente informa ausência de procedimento confirmado; quando duas fontes divergem, evidencia conflito. |
| **AC-008** | REQ-011, REQ-013 | Editor autorizado cadastra artigo estruturado com espaço, autoria e estado de rascunho, sem aparecer em busca oficial. |
| **AC-009** | REQ-012, REQ-026 | Artigo estruturado e PDF válido entram nos seus fluxos; outro formato é recusado com mensagem clara; PDF inválido/ilegível gera falha explícita, sem publicação automática. |
| **AC-010** | REQ-014, REQ-021 | "Adicione este procedimento" gera prévia; antes da confirmação não existe novo artigo; após confirmar, existe proposta/rascunho, nunca publicação automática. |
| **AC-011** | REQ-015, REQ-020 | Pedido de atualização apresenta diferenças e cria nova versão; leitores continuam vendo a versão vigente até a aprovação. |
| **AC-012** | REQ-016 | Ao propor artigo de tema semelhante, agente apresenta possível duplicidade e permite escolher atualizar o existente ou prosseguir com justificativa. |
| **AC-013** | REQ-017, REQ-018, REQ-021 | Usuário com perfil **Aprovador de Conhecimento** e acesso ao espaço aprova ou devolve proposta; colaborador, editor, gestor ou administrador **sem essa concessão** não consegue publicar, mesmo invocando diretamente a operação. |
| **AC-014** | REQ-018, REQ-019, REQ-020 | Publicação altera a versão vigente e preserva versões anteriores; rejeição/ajuste mantém o conteúdo fora da busca oficial. |
| **AC-015** | REQ-022, REQ-023 | Documento com segredo detectado não é publicado inadvertidamente; texto que instrui a IA a ignorar permissões não altera o comportamento de acesso. |
| **AC-016** | REQ-024 | Toda transição editorial e alteração de permissão registra quem, quando, qual recurso e qual ação, sem incluir credenciais. |
| **AC-017** | REQ-025 | Feedback negativo pode ser enviado e fica ligado a resposta e referências para avaliação posterior. |
| **AC-018** | REQ-026 | Em indisponibilidade da IA ou falha na indexação, sistema informa falha sem declarar artigo publicado; repetição não cria publicações duplicadas. |
| **AC-019** | REQ-001 | Login próprio permite entrar e sair; logout invalida a sessão, e usuário desativado não consegue iniciar uma nova sessão. |
| **AC-020** | REQ-017, REQ-018, REQ-021 | Administrador atribui e revoga a função de Aprovador de Conhecimento em um espaço; a concessão permite revisão/publicação apenas naquele espaço e a revogação bloqueia novas aprovações. |
| **AC-021** | REQ-002, REQ-007, REQ-012 | O piloto atende usuários reais de TI com artigos e PDFs; testes de isolamento com setores fictícios são executados sem exigir que RH/Financeiro participem do piloto. |
| **AC-022** | REQ-018, REQ-021, REQ-024 | Usuário autor de artigo e com perfil Aprovador de Conhecimento autorizado para aquele espaço consegue aprovar/publicar sua própria proposta por ação humana explícita, com evento de auditoria; o mesmo autor sem tal concessão não consegue publicar, inclusive por operação direta ou solicitação ao agente. |
| **AC-023** | REQ-001, REQ-004, REQ-024, REQ-027 | Administrador autorizado consegue criar, desativar e ajustar permissões de contas com registro de auditoria; colaborador, editor ou aprovador sem papel administrativo recebe negativa ao tentar essas operações via interface, API ou chat; inexistem endpoints públicos de autoinscrição. |
| **AC-024** | REQ-003, REQ-004, REQ-005, REQ-007, REQ-028 | Dois usuários autenticados e ativos, sem permissão a espaços restritos, conseguem consultar e citar artigos publicados universais e corporativos compartilhados; tentativas de localizar ou ler um documento restrito por busca, ID, API, conversa ou ferramenta do agente não revelam seu conteúdo nem seus metadados. Após conceder acesso específico, o documento pode ser consultado; após revogar, não pode reaparecer em novas respostas ou contexto. |
| **AC-025** | REQ-001, REQ-024, REQ-027, REQ-029 | Administrador autorizado consegue iniciar redefinição de senha de um colaborador; outro perfil não consegue via painel, API ou chat. No próximo acesso, o colaborador só pode criar uma nova senha até concluir a troca, não consegue acessar chat nem documentos; a troca invalida o meio provisório e sessões anteriores, sem registrar segredos em logs, e a ação fica auditável. Não existe recuperação por e-mail de autoatendimento no MVP. |

## 9. Casos de borda e erros

1. Pedido de publicar em departamento no qual o usuário não possui acesso: negar a ação sem revelar metadados confidenciais.
2. Artigo com nome semelhante em dois setores: não confundir escopo nem mesclar conteúdo sem permissão.
3. Usuário com múltiplos departamentos: pesquisar o que é autorizado, sem usar o setor citado no texto como prova de permissão.
4. Documento com versões conflitantes: priorizar versão vigente, declarar conflito real e não criar certeza artificial.
5. Usuário troca de setor durante conversa: renovar decisões de autorização e impedir reuso de contexto privado revogado.
6. Arquivo PDF vazio, corrompido, protegido por senha ou sem texto extraível: estado de erro ou revisão manual, sem publicação automática.
7. Mensagem "salve isso" sem conteúdo ou escopo suficiente: pedir complemento antes de criar proposta.
8. Duas pessoas editam o mesmo artigo: evitar sobrescrita silenciosa; sinalizar conflito de revisões.
9. Aprovação repetida ou requisição reenviada: não criar versões publicadas duplicadas.
10. Prompt injection em documento recuperado: texto malicioso não concede permissões nem executa ferramentas administrativas.
11. Proposta contendo dados pessoais e sigilosos: bloquear divulgação até revisão conforme política de tratamento de dados.
12. Fonte citada é arquivada durante conversa: novas respostas não a tratam como vigente.
13. Redefinição de senha de uma conta desativada ou inexistente: negar operação e não revelar credenciais.
14. Tentativa de usar sessão antiga, mecanismo provisório expirado/reutilizado ou contornar a troca obrigatória: negar acesso normal sem vazar segredos.

## 10. Fora do escopo do MVP

- Detectar autonomamente incidentes resolvidos e sugerir artigo; previsto para fase posterior, **já aprovado como direção de produto**.
- Publicar ou modificar conhecimento oficial sem revisão humana.
- Executar comandos em servidores, modificar infraestrutura, aprovar pagamentos ou realizar outras operações em sistemas corporativos.
- Multiempresa/multitenancy.
- Implantação real nos demais setores antes da conclusão do piloto de TI; a arquitetura continuará pronta para expandir.
- Importação de DOCX, planilhas, imagens avulsas e outros tipos de arquivo além de artigos estruturados e PDFs.
- SSO corporativo no MVP (o login será próprio).
- Recuperação de senha por autoatendimento ou e-mail, sem intervenção administrativa.
- Agentes especializados independentes para cada departamento.
- Integrações com canais externos (WhatsApp/Teams) e sincronização automática com sistemas corporativos, a definir em fases posteriores.
- Pesquisa irrestrita na internet como fonte automática de conhecimento oficial.

## 11. Prioridade do MVP: segurança e confiabilidade

As seguintes validações têm prioridade sobre recursos adicionais e configurações administrativas:

1. **Controle de acesso real:** negar consultas não autorizadas via chat, API, ID direto, busca e ferramentas; revalidar permissões após revogação (REQ-003/004/005/028, AC-001/003/004/024).
2. **Confiabilidade das respostas:** distinguir resposta fundamentada, hipótese e desconhecimento; citar documento/versão quando usar o cérebro; informar conflitos ou ausência de fonte (REQ-008/009/019, AC-006/007).
3. **Segurança de artigos e PDFs:** validar arquivos e limites, impedir instruções maliciosas incorporadas aos documentos e bloquear divulgação de segredos detectados (REQ-012/022/023, AC-009/015).
4. **Consistência do conhecimento:** não publicar documentos parcialmente processados, manter a última versão válida, não duplicar publicações em tentativas repetidas e auditar alterações (REQ-018/020/024/026, AC-014/016/018/022).
5. **Operação observável:** registrar falhas técnicas, recuperação, custos e tempos sem expor conteúdos ou credenciais. Avaliar com uma bateria de perguntas reais de TI e cenários de falha antes de liberar o MVP (REQ-024/025/026, AC-017/018).

Limiares quantitativos de qualidade e desempenho continuam **ABERTOS** (Q-009), para serem definidos com dados e testes do piloto. Não abrir novas etapas de classificação de conteúdo enquanto as garantias acima não estiverem verificadas.

## 12. Questões esclarecidas e pendentes

| ID | Estado | Tema | Decisão ou questão pendente | Impacto |
|---|---|---|---|---|
| **Q-001** | **VALIDADO** | Identidade | Login próprio com contas locais no MVP; não haverá SSO inicialmente. | Requer gerir credenciais, desativação e recuperação de contas. |
| **Q-002** | **VALIDADO** | Hierarquia de acesso | Conteúdos universal e corporativo **compartilhado** estão disponíveis a todos os usuários autenticados e ativos; conteúdos **restritos**, mesmo dentro do corporativo ou de setor, exigem permissão específica (DEC-016). | Política de leitura vinculante para recuperação, citações e respostas. |
| **Q-003** | **VALIDADO** | Revisão | O Aprovador de Conhecimento **pode aprovar seu próprio artigo** nos espaços em que tenha concessão de aprovação. No fluxo padrão não se exige segundo aprovador. | Permite autoaprovação humana com autorização e auditoria; revisões extras por categoria ficam fora do MVP (Q-006). |
| **Q-004** | **VALIDADO** | Piloto | Somente o setor de Tecnologia da Informação participa inicialmente; responsáveis serão definidos posteriormente. | Conteúdo e avaliação do piloto concentrados em TI. |
| **Q-005** | **VALIDADO** | Formatos | Somente artigos estruturados e PDFs no MVP. | Limita a superfície de ingestão inicial. |
| **Q-006** | **FORA DO MVP** | Classificação adicional | Não criar terceira categoria de sigilo nem fluxo editorial específico. Permanecem **obrigatórios** controle compartilhado/restrito e proteção de segredos e dados pessoais. | Reduz complexidade sem relaxar segurança. |
| **Q-007** | **ABERTO** | Retenção | Por quanto tempo conversas/documentos ficam disponíveis; como lidar com histórico após revogação? | Privacidade, uso de memória e governança. |
| **Q-008** | **ABERTO** | Operação | Quem cura o conhecimento universal, corporativo e setorial, e qual o fluxo para fontes externas? | Qualidade editorial e manutenção. |
| **Q-009** | **ABERTO** | Qualidade | Quais métricas-alvo de precisão, latência, custo e cobertura tornam o piloto aceitável? | Go/no-go do MVP. |
| **Q-010** | **VALIDADO** | Contas locais | Somente administradores cadastram contas, gerenciam permissões e iniciam redefinições de senha. A troca de senha é obrigatória no próximo acesso; sem recuperação por e-mail/autoatendimento no MVP. | Provisionamento e recuperação centralizados; especificar a forma segura de credencial temporária no plano técnico. |
| **Q-011** | **ABERTO** | Responsáveis do piloto | Quem será responsável por aprovar artigos de TI e validar perguntas reais? | Preparação operacional do piloto. |
| **Q-012** | **ABERTO** | PDFs escaneados | No MVP, PDFs sem texto extraível devem exigir revisão/manual ou passar por OCR? | Escopo de processamento e qualidade de ingestão. |

## 13. Registro de escolhas e alternativas

- **Escopos de conhecimento:** adotados três escopos lógicos, em vez de base indiferenciada. Conhecimento universal e corporativo compartilhado é legível por todos os colaboradores autenticados; documentos restritos exigem concessão específica. Alternativa não adotada: exigir permissão individual para todo conteúdo, inclusive universal. Motivo: facilitar consultas gerais sem perder confidencialidade; impacto: verificação de acesso em todas as operações de leitura.
- **Um agente central:** escolhido em vez de agente por departamento. Motivo: reduzir duplicacao e preservar conversa unificada; impacto: ferramentas precisam filtrar suas fontes pelo usuário autenticado.
- **Publicação supervisionada:** escolhida em vez de autoaprendizado com publicação imediata. Motivo: controlar erros, dados sigilosos e procedencia; impacto: exige revisores e fila editorial.
- **MVP via chat + painel:** ambos incluidos, em vez de painel apenas. Motivo: facilidade de registro de conhecimento e validação das permissões no mesmo fluxo.

## 14. Esclarecimentos incorporados em 20/11/2026

As definições de login próprio, perfil Aprovador de Conhecimento, piloto apenas com TI, fontes restritas a artigos/PDFs **e autoaprovação por Aprovador de Conhecimento autorizado** foram comunicadas explicitamente pelo solicitante. O registro detalhado, com alternativas e impactos, encontra-se em `clarifications.md`. O provisionamento de contas é exclusivo dos administradores (DEC-015); conhecimento universal e corporativo compartilhado é legível pelos usuários autenticados e o restrito demanda concessão específica (DEC-016); a recuperação de senha foi definida como **administrativa**, com troca obrigatória no acesso seguinte (DEC-017); o tratamento de PDFs digitalizados permanece **ABERTO**. Novos níveis de sigilo e aprovação editorial adicional ficam **fora do MVP** (DEC-018).

## 15. Próximo marco

**Revisão e aprovação da especificação funcional:** estão validadas as decisões de autenticação, acesso, publicação e escopo do piloto. Não bloquear o planejamento discutindo classificações adicionais (Q-006 fora do MVP). Antes de implementar, concentrar o plano nos testes de autorização, confiabilidade de RAG, segurança da ingestão de PDFs, consistência editorial e recuperação de falhas; resolver apenas as pendências que afetem essas garantias (como PDFs escaneados e retenção). Depois, decompor tarefas e implementar. O status `EM VALIDAÇÃO` não significa aprovação integral da especificação.