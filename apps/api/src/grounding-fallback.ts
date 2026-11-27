import type {Source} from './retrieval.js';
import {hasInfrastructureSecrets,hasSecrets} from './knowledge.js';
import {lastProgressQuestion} from './support-dialogue.js';
const common=new Set('preciso quero saber como qual quais configurar configuracao configuro fazer instalar instalacao procedimento procedimentos passo passos completo completa inteiro inteira tutorial instrucoes roteiro todos todas etapas manual ajuda preciso necessario tenho pode poderia passe passar envie enviar mostre mostrar forneca sim claro beleza certo agora orientacao tecnica por favor para sobre meu minha um uma do da de dos das no na o a os as em com e ou que isso esse essa modelo marca nao sei fixo problema sistema ambiente'.split(' '));
const normal=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
const words=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)??[];
// Keep fallback relevance strict while accepting ordinary Portuguese inflection
// such as habilito/habilitar and alteração/alterar. Seven shared characters
// avoid turning a short, generic prefix into evidence of applicability.
const suffixes=new Set(['o','a','as','os','ar','er','ir','am','em','ando','endo','indo','ado','ada','ados','adas']);
const sameLexeme=(left:string,right:string)=>{
 if(left===right)return true;
 if(!/^[a-z]+$/.test(left)||!/^[a-z]+$/.test(right))return false;
 let shared=0;while(shared<Math.min(left.length,right.length)&&left[shared]===right[shared])shared++;
 return shared>=7&&suffixes.has(left.slice(shared))&&suffixes.has(right.slice(shared));
};
const hasLexeme=(tokens:string[],term:string)=>tokens.some(token=>sameLexeme(token,term));
const readableChecklist=(content:string)=>content
 .replace(/\s+-\s+\[[ xX]\]\s+/g,'\n- ')
 .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm,'- ');
const contentLines=(content:string)=>readableChecklist(content).split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
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
 const title=words(current[0].title);
 const body=words(current.map(s=>s.content).join(' '));
 if(terms.length&&(!terms.some(term=>hasLexeme(title,term))||terms.some(term=>!hasLexeme(title,term)&&!hasLexeme(body,term))))return null;
 // A single complete retrieved passage; don't splice chunks or truncate steps.
 const best=current.find(s=>s.ordinal===-1&&s.completeDocument===true&&s.content.length<=3500)??current.find(s=>s.ordinal===0&&s.completeDocument!==false&&s.content.length<=1100);
 if(!best||best.content.trim().length<20)return null;
 return best;
}
/** Not a synthesized answer. Return one complete retrieved passage, explicitly
 * attributed and scoped. No selection of a winner across different documents,
 * historical comparisons, unknown relevance, or suspicious instructions. */
export function literalGroundingFallback(question:string,sources:Source[]):{answer:string;sources:Source[]}|null{
 const best=eligibleSource(question,sources);
 if(!best)return null;
 return {answer:'Encontrei um procedimento publicado que pode ajudar. Não consegui validar a síntese da IA, então segue o trecho original da documentação. Confirme se o equipamento ou ambiente corresponde ao artigo antes de aplicar. Consulte a fonte para o procedimento completo.\n\n'+best.title+' [1]\n\n'+readableChecklist(best.content),
  sources:[{...best,excerpts:[best.content]}]};
}

/** A focused value lookup may return one exact authorized line, including an
 * operational default password. It never synthesizes, combines versions or
 * exposes personal/infrastructure secrets. */
export function focusedGroundingFallback(question:string,sources:Source[],contextualQuery=question):{answer:string;sources:Source[]}|null{
 const normalized=question.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
 const focus=['senha','usuario','login','endereco','ip','porta','servidor','url','link','valor','codigo','caminho','menu']
  .find(term=>new RegExp(`\\b${term}\\b`).test(normalized));
 if(!focus||/\b(?:anterior|antigo|historico|comparar|versoes|pessoal|minha conta|meu usuario|de outro usuario)\b/.test(normalized)||hasSecrets(question))return null;
 const current=sources.filter(source=>!source.historical);
 if(!current.length||sources.some(source=>source.historical)||new Set(current.map(source=>source.versionId)).size!==1)return null;
 if(current.some(source=>hostile.test(source.title)||hostile.test(source.content)||hasSecrets(source.title)||hasInfrastructureSecrets(source.content)))return null;
 const proposed=/\bpode ser\s+([\p{L}\p{N}._-]{2,80})/iu.exec(question)?.[1];
 const proposalMatches=(text:string)=>!proposed||text.split(/[^\p{L}\p{N}._-]+/u).some(value=>value.replace(/\.$/,'')===proposed);
 const contextTerms=words(contextualQuery).filter(term=>!common.has(term)&&!['dado','configuracao','senha','usuario','login','endereco','porta','servidor','url','link','valor','codigo','caminho','menu','interface','acessar','acesso','parte','entendi','ser'].includes(term)&&term!==normal(proposed??''));
 const availableWords=words(current.map(source=>source.title+' '+source.content).join(' '));
 if(contextTerms.some(term=>!hasLexeme(availableWords,term)))return null;
 const candidates=current.flatMap(source=>source.content.split(/\r?\n|(?<=[.!?])\s+/).map(text=>({source,text:text.trim()})))
  .filter(({text})=>text.length>=4&&text.length<=240&&new RegExp(`\\b${focus}\\b`,'i').test(text)&&proposalMatches(text)&&(focus!=='senha'||/\b(?:padr[aã]o|operacional|equipamento)\b/i.test(text))&&!/\b(?:pessoal|individual|privad[ao]|de outro usu[aá]rio)\b/i.test(text));
 const distinct=new Set(candidates.map(({text})=>text.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/,'').trim()));
 if(distinct.size!==1)return null;
 const selected=candidates[0];
 if(!selected||hasSecrets(selected.text)||hasInfrastructureSecrets(selected.text))return null;
 const answer=selected.text.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/,'').trim();
 return {answer:`${answer} [1]`,sources:[{...selected.source,excerpts:[selected.text]}]};
}

function naturalStep(raw:string):string{
 const step=raw.replace(/^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/,'').trim();
 const replacements:[RegExp,string][]=[
  [/^Segurar\b/i,'Segure'],[/^Acessar\b/i,'Acesse'],[/^Fazer\b/i,'Faça'],[/^Ir\b/i,'Vá'],
  [/^Abrir\b/i,'Abra'],[/^Clicar\b/i,'Clique'],[/^Selecionar\b/i,'Selecione'],
  [/^Configurar\b/i,'Configure'],[/^Verificar\b/i,'Verifique'],[/^Consultar\b/i,'Consulte']
 ];
 const natural=replacements.reduce((value,[pattern,replacement])=>value.replace(pattern,replacement),step);
 if(step.includes('>')&&natural===step&&!/\b(?:acesse|abra|vá|selecione|clique)\b/i.test(step))return `Acesse ${step.replace(/[.;]+$/,'')}.`;
 return /[.!?]$/.test(natural)?natural:natural+'.';
}

/** Only explicit user confirmation of the immediately preceding progress
 * question can authorize advancing a deterministic stage. Merely seeing an
 * instruction in the history does not establish that it was completed. */
export function confirmedGuidance(history:{role:'user'|'assistant';content:string}[],message:string):string[]{
 const turns=[...history,{role:'user' as const,content:message}];
 const confirmed:string[]=[];
 for(let i=1;i<turns.length;i++){
  const previous=turns[i-1],next=turns[i];
  if(next.role==='user'&&/\b(?:mudando de assunto|outro assunto|outro problema|agora sobre)\b/.test(normal(next.content)))confirmed.length=0;
  if(previous.role==='assistant'&&next.role==='user'&&lastProgressQuestion(previous.content)&&
    /^(?:sim|consegui|conclui|feito|ja fiz|deu certo|funcionou)[.!\s]*$/.test(normal(next.content).trim()))confirmed.push(previous.content);
 }
 return confirmed;
}
const bullet=/^(?:[-*+]\s+|\d+[.)]\s+)/;
const heading=/^#{1,6}\s+(.+)$/;
const prerequisite=/\b(?:antes de|somente|apenas se|se |caso |desde que|nao |nunca|requisito|condicao|obrigatorio|necessario|depois de)\b/i;
type Stage={scope:string[];steps:string[]};
function guidedStages(content:string):Stage[]{
 const lines=contentLines(content);
 if(!lines.some(line=>bullet.test(line)))return lines.length<=3?[{scope:[],steps:lines}]:[];
 const stages:Stage[]=[];
 let global:string[]=[],scope:string[]=[],steps:string[]=[];
 const flush=()=>{if(steps.length){stages.push({scope:[...global,...scope],steps});steps=[];}};
 for(const line of lines){
  if(heading.test(line)){flush();scope=[line];continue;}
  if(!bullet.test(line)){flush();if(!stages.length&&!scope.length)global.push(line);else scope.push(line);continue;}
  // A condition or prerequisite starts a fresh group and is carried to later stages.
  if(prerequisite.test(normal(line))){flush();scope.push(line);continue;}
  steps.push(line);if(steps.length===2)flush();
 }
 flush();
 return stages;
}
/** Do not present a later stage without explicit confirmation of the previous
 * contiguous stages. Preserve headings and prose prerequisites verbatim. */
export function guidedGroundingFallback(question:string,sources:Source[],confirmedAnswers:string[]=[]):{answer:string;sources:Source[]}|null{
 const best=eligibleSource(question,sources);
 if(!best)return null;
 const stages=guidedStages(best.content);
 const seen=confirmedAnswers.map(answer=>normal(answer).replace(/\s+/g,' '));
 let index=0;
 for(const confirmed of seen){
  const stage=stages[index];
  if(stage&&stage.steps.every(line=>confirmed.includes(normal(naturalStep(line)).replace(/\s+/g,' '))))index++;
 }
 // A first chunk may be incomplete; never infer subsequent stages from it.
 if(index>0&&!best.completeDocument&&sources.some(s=>s.ordinal!==best.ordinal))return null;
 const stage=stages[index];
 if(!stage)return null;
 const lines=[...stage.scope,...stage.steps];
 if(lines.some(line=>hasSecrets(line)||hasInfrastructureSecrets(line)))return null;
 const scope=stage.scope.map(line=>line.replace(/^#{1,6}\s+/,'').replace(bullet,'')).join('\n');
 const steps=stage.steps.map((line,i)=>`${i+1}. ${naturalStep(line)}`).join('\n');
 if(scope.length+steps.length>850)return null;
 return {answer:`Vamos por etapas. Primeiro, faça o seguinte:\n\n${scope?scope+'\n\n':''}${steps} [1]\n\nConseguiu concluir essa etapa?`,
  sources:[{...best,excerpts:lines.map(line=>line.replace(/^#{1,6}\s+/,'').replace(bullet,'').trim())}]};
}

/** When the user explicitly requests the complete procedure, recover all
 * documented stages in a readable structure instead of returning raw Markdown. */
export function completeGroundingFallback(question:string,sources:Source[]):{answer:string;sources:Source[]}|null{
 const best=eligibleSource(question,sources,true);
 if(!best?.completeDocument)return null;
 const normalize=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const lines=contentLines(best.content);
 if(lines.length&&!/^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s)/.test(lines[0])){
  const first=normalize(lines[0]),title=normalize(best.title);
  if(first===title||['configuracao do ','configuracao da ','configuracao de '].some(prefix=>first===prefix+title))lines.shift();
 }
 const rendered:string[]=[];
 let number=0;
 for(const line of lines){
  const heading=/^#{1,6}\s+(.+)$/.exec(line);
  if(heading){rendered.push(`\n${heading[1].trim()}:`);continue;}
  if(!bullet.test(line)&&lines.some(item=>bullet.test(item))){rendered.push(line);continue;}
  number++;
  rendered.push(`${number}. ${naturalStep(line)}`);
 }
 if(!number)return null;
 return {answer:`Claro — aqui está o passo a passo completo:\n\n${rendered.join('\n').trim()} [1]`,
  sources:[{...best,excerpts:[best.content]}]};
}
