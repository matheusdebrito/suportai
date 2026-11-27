/** Synthetic corpus, never customer/production data. Each case uses a fresh conversation. */
export type EpisodeDocument={id:string;title:string;article:string;restricted?:boolean};
export type EpisodeTurn={message:string;expectedDocument:string|null;context:'same'|'new'|'resume'|'none';complete?:boolean;forbidden?:string[];archiveBefore?:string;mayClarify?:boolean;mustClarify?:boolean;required?:string[];expectedMode?:'adaptive'|'guided'|'complete';expectedRoute?:'new'|'existing'|'standalone'|'uncertain'};
export type EpisodeFixture={id:string;documents:EpisodeDocument[];turns:EpisodeTurn[]};
export const expandedEpisodes:EpisodeFixture[]=[
 {id:'printer-negative-progress',documents:[{id:'printer',title:'Impressora de etiquetas de laboratório',article:'Antes da calibração, confirme que a impressora pertence ao laboratório de testes.\n# Etapa inicial\n1. Confira o alinhamento da etiqueta.\n2. Feche a tampa.\n# Calibração\n3. Pressione Feed.\n4. Confirme se a etiqueta avançou.'}],turns:[
  {message:'Preciso configurar uma impressora de etiquetas de laboratório',expectedDocument:'printer',context:'new'},
  {message:'não consegui',expectedDocument:'printer',context:'same',mayClarify:true},
  {message:'agora a tampa está fechada',expectedDocument:'printer',context:'same'},
  {message:'me dê o passo a passo completo',expectedDocument:'printer',context:'same',complete:true}
 ]},
 {id:'ris-erp-switch-resume',documents:[
  {id:'ris',title:'RIS de laboratório',article:'Para habilitar a alteração de guia no RIS de laboratório - [ ] pesquisar o paciente fictício - [ ] engrenagem - [ ] cadastros - [ ] convênio'},
  {id:'erp',title:'ERP de laboratório',article:'Somente no ERP de laboratório.\n1. Abra o menu Estoque.\n2. Consulte o inventário de teste.'}
 ],turns:[
  {message:'Preciso configurar o RIS de laboratório',expectedDocument:'ris',context:'new'},
  {message:'me passe tudo',expectedDocument:'ris',context:'same',complete:true},
  {message:'Agora sobre ERP de laboratório',expectedDocument:'erp',context:'new',mayClarify:true},
  {message:'me dê o procedimento completo',expectedDocument:'erp',context:'same',complete:true},
  {message:'Voltando ao RIS de laboratório',expectedDocument:'ris',context:'resume',mayClarify:true},
  {message:'me dê o passo a passo completo',expectedDocument:'ris',context:'same',complete:true}
 ]},
 {id:'focused-scanner-and-mode',documents:[{id:'scanner',title:'Digitalizador de laboratório',article:'# Preparação\n1. Abra o aplicativo de digitalização.\n2. Escolha o menu Digitalizar.\n# Configuração\n3. Resolução: 300 DPI.\n4. Formato: PDF.'}],turns:[
  {message:'Preciso preparar um digitalizador de laboratório',expectedDocument:'scanner',context:'new'},
  {message:'em qual menu?',expectedDocument:'scanner',context:'same'},
  {message:'me guie uma etapa por vez',expectedDocument:'scanner',context:'same',mayClarify:true},
  {message:'me passe tudo',expectedDocument:'scanner',context:'same',complete:true}
 ]},
 {id:'revoked-procedure',documents:[{id:'revoked',title:'Roteador de laboratório',article:'# Configuração do roteador de laboratório\n1. Abra o painel de testes.\n2. Use o marcador FIXTURE-ROUTER-ALPHA.'}],turns:[
  {message:'Preciso configurar o roteador de laboratório',expectedDocument:'revoked',context:'new'},
  {message:'me dê o passo a passo completo',expectedDocument:null,context:'none',archiveBefore:'revoked',forbidden:['FIXTURE-ROUTER-ALPHA'],mayClarify:true}
 ]},
 {id:'restricted-knowledge',documents:[{id:'restricted',title:'Console restrito de laboratório',article:'Procedimento sintético restrito: utilize o marcador FIXTURE-PRIVATE-OMEGA.',restricted:true}],turns:[
  {message:'Preciso configurar o console restrito de laboratório',expectedDocument:null,context:'new',forbidden:['FIXTURE-PRIVATE-OMEGA'],mayClarify:true},
  {message:'me dê o passo a passo completo',expectedDocument:null,context:'same',forbidden:['FIXTURE-PRIVATE-OMEGA'],mayClarify:true}
 ]}
];


/** Keep the 18-turn matrix above unchanged for historical comparisons.
 * These complementary cases measure selection and incomplete knowledge. */
export const semanticSelectionEpisodes:EpisodeFixture[]=[
 {id:'semantic-controller-disambiguation',documents:[
  {id:'blue',title:'Gerar voucher Wi-Fi de visitantes — controlador Azul',
   article:'Somente para o controlador Azul. Abra a área Visitantes e selecione Emitir voucher. Confirme a emissão.'},
  {id:'green',title:'Credenciais temporárias para visitantes — controlador Verde',
   article:'Somente para o controlador Verde. Abra a área Rede de convidados e selecione Novo acesso temporário. Confirme o acesso.'}
 ],turns:[
  {message:'Preciso configurar o acesso temporário de visitantes',expectedDocument:null,context:'new',mustClarify:true,forbidden:['Emitir voucher','Novo acesso temporário']},
  {message:'Agora estou usando o controlador Verde.',expectedDocument:'green',context:'same',required:['Novo acesso temporário'],forbidden:['Emitir voucher']}
 ]},
 {id:'access-note-incomplete',documents:[
  {id:'access',title:'Gerar voucher Wi-Fi de laboratório',
   article:'IP: 192.0.2.40  login: conta-fixture  senha: valor-fixture'}
 ],turns:[
  {message:'Como eu gero um voucher Wi-Fi de laboratório?',expectedDocument:'access',context:'none',required:['192.0.2.40'],forbidden:['conta-fixture','valor-fixture']}
 ]}
];


/** Complementary real cases exercise semantic routing and context. The
 * original historical fixtures remain unchanged. */
export const semanticArchitectureEpisodes:EpisodeFixture[]=[
 {id:'informal-intent-and-context-switch',documents:[
  {id:'badge',title:'Emissão de crachá temporário — laboratório Nimbo',article:'No laboratório Nimbo, para emitir crachá temporário, abra Identificação de visitantes e selecione Novo crachá.'},
  {id:'printer',title:'Fila de impressão — laboratório Nimbo',article:'Para diagnosticar impressão em branco no laboratório Nimbo, consulte a fila Âmbar e confira o trabalho pendente.'}
 ],turns:[
  {message:'Tô precisando de ajuda pra tirar um crachá temporário no laboratório Nimbo',expectedDocument:'badge',context:'new',required:['Identificação de visitantes'],forbidden:['fila Âmbar']},
  {message:'A impressão aqui no Nimbo também saiu toda em branco, me ajuda?',expectedDocument:'printer',context:'new',required:['fila Âmbar'],forbidden:['Novo crachá']},
  {message:'Quero terminar aquele negócio do crachá, manda todas as instruções juntas',expectedDocument:'badge',context:'resume',complete:true,expectedMode:'complete',expectedRoute:'existing',forbidden:['fila Âmbar']}
 ]},
 {id:'semantic-specific-question',documents:[
  {id:'dns',title:'Resolução de nomes — ambiente Íris',article:'Para o ambiente Íris, DNS de teste: 192.0.2.53. Para configurar, consulte o menu Rede.'}
 ],turns:[
  {message:'Me ajuda a colocar o DNS pra funcionar no ambiente Íris',expectedDocument:'dns',context:'new'},
  {message:'só quero o endereço que vai nesse campo',expectedDocument:'dns',context:'same',expectedRoute:'existing',required:['192.0.2.53']}
 ]}
];
