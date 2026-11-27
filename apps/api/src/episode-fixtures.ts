/** Synthetic corpus, never customer/production data. Each case uses a fresh conversation. */
export type EpisodeDocument={id:string;title:string;article:string;restricted?:boolean};
export type EpisodeTurn={message:string;expectedDocument:string|null;context:'same'|'new'|'resume'|'none';complete?:boolean;forbidden?:string[];archiveBefore?:string;mayClarify?:boolean};
export type EpisodeFixture={id:string;documents:EpisodeDocument[];turns:EpisodeTurn[]};
export const expandedEpisodes:EpisodeFixture[]=[
 {id:'printer-negative-progress',documents:[{id:'printer',title:'Impressora de etiquetas de laboratório',article:'Somente no laboratório de testes, com a tampa fechada.\n# Etapa inicial\n1. Confira o alinhamento da etiqueta.\n2. Feche a tampa.\n# Calibração\n3. Pressione Feed.\n4. Confirme se a etiqueta avançou.'}],turns:[
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
