import type {Source} from './retrieval.js';
import {hasInfrastructureSecrets,hasSecrets} from './knowledge.js';
const common=new Set('preciso quero saber como qual quais configurar configuracao configuro fazer instalar instalacao procedimento procedimentos passo passos completo completa inteiro inteira tutorial instrucoes guia roteiro todos todas etapas manual ajuda preciso necessario tenho pode poderia passe passar envie enviar mostre mostrar forneca sim claro beleza certo agora orientacao tecnica por favor para sobre meu minha um uma do da de dos das no na o a os as em com e ou que isso esse essa modelo marca nao sei fixo problema sistema ambiente'.split(' '));
const normal=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
const words=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)??[];
const hostile=/(?:ignore|desconsidere|desobede[cç]a|esque[cç]a)\s+(?:todas?\s+)?(?:as\s+|os\s+)?(?:regras|permiss[oõ]es|instru[cç][oõ]es|mensagens|restri[cç][oõ]es)|(?:prompt\s*(?:injection|do sistema)|instru[cç][aã]o[_\s-]*maliciosa|system\s*prompt|revele\s+(?:um\s+)?segredo)/i;
const sensitiveRequest=/\b(?:senha|password|token|credencial|chave|segredo)\b/i;
function eligibleSource(question:string,sources:Source[],allowGeneric=false):Source|null{
 if(sensitiveRequest.test(question)||/\b(?:anterior|antigo|hist[oó]ric[oa]|comparar|vers[oõ]es)\b/i.test(question))return null;
 const current=sources.filter(s=>!s.historical);
 if(!current.length||sources.some(s=>s.historical)||new Set(current.map(s=>s.versionId)).size!==1)return null;
 if(current.some(s=>hostile.test(s.title)||hostile.test(s.content)||hasSecrets(s.title)||hasInfrastructureSecrets(s.content)))return null;
 const terms=[...new Set(words(question).filter(w=>!common.has(w)))];
 if(!terms.length&&!allowGeneric)return null;
 // Require all specific terms in the retrieved document, and one in the title.
 // Never infer applicability solely from vector similarity or a generic word.
 const title=new Set(words(current[0].title));
 const body=new Set(words(current.map(s=>s.content).join(' ')));
 if(terms.length&&(!terms.some(w=>title.has(w))||terms.some(w=>!title.has(w)&&!body.has(w))))return null;
 // A single complete retrieved passage; don't splice chunks or truncate steps.
 const best=current.find(s=>s.ordinal===-1&&s.content.length<=3500)??current.find(s=>s.ordinal===0&&s.content.length<=1100);
 if(!best||best.content.trim().length<20)return null;
 return best;
}
/** Not a synthesized answer. Return one complete retrieved passage, explicitly
 * attributed and scoped. No selection of a winner across different documents,
 * historical comparisons, unknown relevance, or suspicious instructions. */
export function literalGroundingFallback(question:string,sources:Source[]):{answer:string;sources:Source[]}|null{
 const best=eligibleSource(question,sources);
 if(!best)return null;
 return {answer:'Encontrei um procedimento publicado que pode ajudar. Não consegui validar a síntese da IA, então segue o trecho original da documentação. Confirme se o equipamento ou ambiente corresponde ao artigo antes de aplicar. Consulte a fonte para o procedimento completo.\n\n'+best.title+' [1]\n\n'+best.content,
  sources:[{...best,excerpts:[best.content]}]};
}

/** A focused value lookup may return one exact authorized line, including an
 * operational default password. It never synthesizes, combines versions or
 * exposes personal/infrastructure secrets. */
export function focusedGroundingFallback(question:string,sources:Source[]):{answer:string;sources:Source[]}|null{
 const normalized=question.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
 const focus=['senha','usuario','login','endereco','ip','porta','servidor','url','link','valor','codigo','caminho','menu']
  .find(term=>new RegExp(`\\b${term}\\b`).test(normalized));
 if(!focus||/\b(?:anterior|antigo|historico|comparar|versoes)\b/.test(normalized))return null;
 const current=sources.filter(source=>!source.historical);
 if(!current.length||sources.some(source=>source.historical)||new Set(current.map(source=>source.versionId)).size!==1)return null;
 if(current.some(source=>hostile.test(source.title)||hostile.test(source.content)||hasSecrets(source.title)||hasInfrastructureSecrets(source.content)))return null;
 const proposed=/\bpode ser\s+([\p{L}\p{N}._-]{2,80})/u.exec(normalized)?.[1];
 const candidates=current.flatMap(source=>source.content.split(/\r?\n|(?<=[.!?])\s+/).map(text=>({source,text:text.trim()})))
  .filter(({text})=>text.length>=4&&text.length<=240&&new RegExp(`\\b${focus}\\b`,'i').test(text)&&(!proposed||normal(text).includes(proposed)));
 const selected=candidates[0];
 if(!selected||hasSecrets(selected.text)||hasInfrastructureSecrets(selected.text))return null;
 const answer=selected.text.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/,'').trim();
 return {answer:`${answer} [1]`,sources:[{...selected.source,excerpts:[selected.text]}]};
}

function naturalStep(raw:string):string{
 const step=raw.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/,'').trim();
 const replacements:[RegExp,string][]=[
  [/^Segurar\b/i,'Segure'],[/^Acessar\b/i,'Acesse'],[/^Fazer\b/i,'Faça'],[/^Ir\b/i,'Vá'],
  [/^Abrir\b/i,'Abra'],[/^Clicar\b/i,'Clique'],[/^Selecionar\b/i,'Selecione'],
  [/^Configurar\b/i,'Configure'],[/^Verificar\b/i,'Verifique'],[/^Consultar\b/i,'Consulte']
 ];
 const natural=replacements.reduce((value,[pattern,replacement])=>value.replace(pattern,replacement),step);
 if(step.includes('>')&&natural===step&&!/\b(?:acesse|abra|vá|selecione|clique)\b/i.test(step))return `Acesse ${step.replace(/[.;]+$/,'')}.`;
 return /[.!?]$/.test(natural)?natural:natural+'.';
}

/** A guided recovery must never dump the whole article. It presents only the
 * first documented stage and asks for the observed result. */
export function guidedGroundingFallback(question:string,sources:Source[],previousAnswers:string[]=[]):{answer:string;sources:Source[]}|null{
 const best=eligibleSource(question,sources);
 if(!best)return null;
 const lines=best.content.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
 const seen=normal(previousAnswers.join('\n')).replace(/\s+/g,' ');
 const actionable=lines.filter(line=>!/^#{1,6}\s+/.test(line)&&/^(?:[-*+]\s+|\d+[.)]\s+)/.test(line));
 const stage=(actionable.length?actionable:lines.filter(line=>!/^#{1,6}\s+/.test(line)))
  .filter(line=>!seen.includes(normal(naturalStep(line)).replace(/\s+/g,' ')))
  .slice(0,2);
 if(!stage.length||stage.some(line=>hasSecrets(line)||hasInfrastructureSecrets(line)))return null;
 const steps=stage.map((line,index)=>`${index+1}. ${naturalStep(line)}`).join('\n');
 return {answer:`Vamos por etapas. Primeiro, faça o seguinte:\n\n${steps} [1]\n\nConseguiu concluir essa etapa?`,
  sources:[{...best,excerpts:stage.map(line=>line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/,'').trim())}]};
}

/** When the user explicitly requests the complete procedure, recover all
 * documented stages in a readable structure instead of returning raw Markdown. */
export function completeGroundingFallback(question:string,sources:Source[]):{answer:string;sources:Source[]}|null{
 const best=eligibleSource(question,sources,true);
 if(!best?.completeDocument)return null;
 const normalize=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const lines=best.content.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
 if(lines.length&&!/^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s)/.test(lines[0])){
  const first=normalize(lines[0]),titleWords=normalize(best.title).split(' ').filter(word=>word.length>2);
  if(first===normalize(best.title)||titleWords.every(word=>first.split(' ').includes(word)))lines.shift();
 }
 const rendered:string[]=[];
 let number=0;
 for(const line of lines){
  const heading=/^#{1,6}\s+(.+)$/.exec(line);
  if(heading){rendered.push(`\n${heading[1].trim()}:`);continue;}
  number++;
  rendered.push(`${number}. ${naturalStep(line)}`);
 }
 if(!number)return null;
 return {answer:`Claro — aqui está o passo a passo completo:\n\n${rendered.join('\n').trim()} [1]`,
  sources:[{...best,excerpts:[best.content]}]};
}
