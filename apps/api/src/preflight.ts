import './env.js';
/**
 * Static operational preflight. Never connects to production and never prints
 * environment values; an OK here is NOT production launch authorization.
 */
export function inspectProductionConfig(env:Record<string,string|undefined>):string[]{
 const issues:string[]=[];
 if(env.NODE_ENV!=='production')issues.push('NODE_ENV precisa ser production');
 const origin=env.APP_ORIGIN?.trim();
 let validOrigin=false;
 try{
   const parsed=new URL(origin??'');
   validOrigin=parsed.protocol==='https:'&&Boolean(parsed.hostname)&&
     !['localhost','127.0.0.1','::1'].includes(parsed.hostname)&&
     !parsed.username&&!parsed.password&&!parsed.hash;
 }catch{}
 if(!validOrigin)issues.push('APP_ORIGIN deve ser HTTPS público ou interno com DNS confiável');
 if(!env.DATABASE_URL?.trim()&&!env.DATABASE_URL_FILE?.trim())issues.push('DATABASE_URL não está configurada');
 if(env.BOOTSTRAP_ADMIN_EMAIL||env.BOOTSTRAP_ADMIN_PASSWORD||env.BOOTSTRAP_ADMIN_PASSWORD_FILE)
   issues.push('Remova credenciais de bootstrap do ambiente contínuo');
 if(env.ALLOW_EXTERNAL_AI_DATA_PROCESSING==='true'&&!env.OPENAI_API_KEY?.trim()&&!env.OPENAI_API_KEY_FILE?.trim())
   issues.push('Processamento externo ativado sem OPENAI_API_KEY');
 if(env.ALLOW_EXTERNAL_AI_DATA_PROCESSING &&
    !['true','false'].includes(env.ALLOW_EXTERNAL_AI_DATA_PROCESSING))
   issues.push('ALLOW_EXTERNAL_AI_DATA_PROCESSING deve ser true ou false');
 return issues;
}
export function isProductionPreflightEntrypoint(path:string|undefined):boolean{
 const filename=path?.replaceAll(String.fromCharCode(92),'/').split('/').pop();
 return filename==='preflight.ts'||filename==='preflight.js';
}
if(isProductionPreflightEntrypoint(process.argv[1])){
 const issues=inspectProductionConfig(process.env);
 if(issues.length){
   process.stderr.write('Preflight de configuração: PENDÊNCIAS\n'+issues.map(x=>'- '+x).join('\n')+'\n');
   process.exitCode=1;
 }else{
   process.stdout.write('Configuração mínima: OK. Isto NÃO autoriza deploy nem uso de dados reais.\n');
 }
 process.stdout.write('Exigem aprovação humana: provedor de IA, isolamento de PDFs, TLS, backup restaurado, retenção, monitoramento e plano de rollback.\n');
}
