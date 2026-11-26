import type {Source} from './retrieval.js';
import {hasInfrastructureSecrets,hasSecrets} from './knowledge.js';
const common=new Set('preciso quero saber como qual quais configurar configuracao configuro fazer instalar instalacao procedimento procedimentos manual ajuda preciso necessario tenho pode poderia por favor para sobre meu minha um uma do da de dos das no na o a os as em com e ou que isso esse essa modelo marca nao sei fixo problema sistema ambiente'.split(' '));
const words=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)??[];
const hostile=/(?:ignore|desconsidere|desobede[cç]a|esque[cç]a)\s+(?:todas?\s+)?(?:as\s+|os\s+)?(?:regras|permiss[oõ]es|instru[cç][oõ]es|mensagens|restri[cç][oõ]es)|(?:prompt\s*(?:injection|do sistema)|instru[cç][aã]o[_\s-]*maliciosa|system\s*prompt|revele\s+(?:um\s+)?segredo)/i;
const sensitiveRequest=/\b(?:senha|password|token|credencial|chave|segredo)\b/i;
/** Not a synthesized answer. Return one complete retrieved passage, explicitly
 * attributed and scoped. No selection of a winner across different documents,
 * historical comparisons, unknown relevance, or suspicious instructions. */
export function literalGroundingFallback(question:string,sources:Source[]):{answer:string;sources:Source[]}|null{
 if(sensitiveRequest.test(question)||/\b(?:anterior|antigo|hist[oó]ric[oa]|comparar|vers[oõ]es)\b/i.test(question))return null;
 const current=sources.filter(s=>!s.historical);
 if(!current.length||sources.some(s=>s.historical)||new Set(current.map(s=>s.versionId)).size!==1)return null;
 if(current.some(s=>hostile.test(s.title)||hostile.test(s.content)||hasSecrets(s.title)||hasInfrastructureSecrets(s.content)))return null;
 const terms=[...new Set(words(question).filter(w=>!common.has(w)))];
 if(!terms.length)return null;
 // Require all specific terms in the retrieved document, and one in the title.
 // Never infer applicability solely from vector similarity or a generic word.
 const title=new Set(words(current[0].title));
 const body=new Set(words(current.map(s=>s.content).join(' ')));
 if(!terms.some(w=>title.has(w))||terms.some(w=>!title.has(w)&&!body.has(w)))return null;
 // A single complete retrieved passage; don't splice chunks or truncate steps.
 const best=current.find(s=>s.ordinal===-1&&s.content.length<=3500)??current.find(s=>s.ordinal===0&&s.content.length<=1100);
 if(!best||best.content.trim().length<20)return null;
 return {answer:'Encontrei um procedimento publicado que pode ajudar. Não consegui validar a síntese da IA, então segue o trecho original da documentação. Confirme se o equipamento ou ambiente corresponde ao artigo antes de aplicar. Consulte a fonte para o procedimento completo.\n\n'+best.title+' [1]\n\n'+best.content,
  sources:[{...best,excerpts:[best.content]}]};
}
