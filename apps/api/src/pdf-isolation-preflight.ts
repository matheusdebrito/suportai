import {readFileSync} from 'node:fs';

export type IsolationSnapshot={platform:string;uid:number|undefined;procStatus:string|undefined};

/** A diagnostic, NOT proof of secure filesystem or network isolation. */
export function inspectPdfWorkerIsolation(snapshot:IsolationSnapshot):string[]{
 const problems:string[]=[];
 if(snapshot.platform!=='linux'){
   problems.push('Verificação de kernel indisponível: executar em Linux no host/contêiner de destino');
   return problems;
 }
 if(snapshot.uid===undefined||snapshot.uid===0)
   problems.push('Worker deve executar com usuário dedicado não-root');
 const status=snapshot.procStatus??'';
 const value=(key:string)=>new RegExp('^'+key+':\\s*([^\\s]+)','m').exec(status)?.[1];
 if(value('NoNewPrivs')!=='1')
   problems.push('NoNewPrivs deve estar ativo no worker');
 if(!/^0+$/.test(value('CapEff')??''))
   problems.push('Capacidades Linux efetivas não foram comprovadamente removidas');
 if(!['1','2'].includes(value('Seccomp')??''))
   problems.push('Seccomp não está habilitado no processo do worker');
 return problems;
}

const invoked=process.argv[1]?.endsWith('/pdf-isolation-preflight.ts')||
 process.argv[1]?.endsWith('\\\\pdf-isolation-preflight.ts');
if(invoked){
 let status:string|undefined;
 try{status=readFileSync('/proc/self/status','utf8');}catch{}
 const issues=inspectPdfWorkerIsolation({
   platform:process.platform,uid:process.getuid?.(),procStatus:status
 });
 if(issues.length){
   process.stderr.write('Pré-verificação do worker: PENDÊNCIAS\n'+issues.map(i=>'- '+i).join('\n')+'\n');
   process.exitCode=1;
 }else process.stdout.write('Controles básicos do processo: OK. Isto NÃO comprova isolamento de rede e filesystem.\n');
 process.stdout.write('Verificar separadamente: rede do parser, filesystem read-only, limites de CPU/memória, dependências e restauração.\n');
}
