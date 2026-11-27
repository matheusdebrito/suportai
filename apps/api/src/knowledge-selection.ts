import type OpenAI from 'openai';
import type {Source} from './retrieval.js';

/** A model's applicability decision is a shortlist, not an authorization or
 * proof of factual support. The independent verifier still sees alternatives. */
export type KnowledgeSelection={versionIds:string[];sufficiency:'sufficient'|'partial'};
export const knowledgeSelectionTool={
 type:'function',function:{
  name:'select_knowledge',strict:true,
  description:'Selecione as versões vigentes recuperadas que realmente se aplicam ao objetivo e contexto do usuário. Compare o conteúdo, finalidade, sistema e ambiente, não apenas a pontuação ou palavras. Use partial quando a fonte só confirmar parte do pedido. Se faltar uma condição para escolher com segurança, pesquise mais, abra um documento ou faça ask_clarification; não chute uma versão. Não concede acesso nem dispensa a verificação independente.',
  parameters:{type:'object',additionalProperties:false,required:['versionIds','sufficiency'],properties:{
   versionIds:{type:'array',items:{type:'string'},description:'IDs exatos de uma a quatro versões vigentes recuperadas neste turno. Use mais de uma somente se complementares e aplicáveis.'},
   sufficiency:{type:'string',enum:['sufficient','partial']}
  }}
 }
} satisfies OpenAI.Chat.Completions.ChatCompletionTool;
export function parseKnowledgeSelection(value:unknown,sources:readonly Source[]):KnowledgeSelection|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const input=value as Record<string,unknown>;
 if(Object.keys(input).length!==2||!Object.hasOwn(input,'versionIds')||!Object.hasOwn(input,'sufficiency')||
    (input.sufficiency!=='sufficient'&&input.sufficiency!=='partial')||!Array.isArray(input.versionIds)||
    input.versionIds.length<1||input.versionIds.length>4)return null;
 const allowed=new Set(sources.filter(source=>!source.historical).map(source=>source.versionId));
 const ids:string[]=[];
 for(const id of input.versionIds){
  if(typeof id!=='string'||!allowed.has(id)||ids.includes(id))return null;
  ids.push(id);
 }
 return {versionIds:ids,sufficiency:input.sufficiency};
}

/** Keep representatives of competing versions visible to the independent
 * reviewer. A proposed selection never removes alternatives from validation.
 * Favor the complete passage of each version when one was already read. */
export function orderKnowledgeEvidence(sources:readonly Source[],selection?:KnowledgeSelection):Source[]{
 if(!selection)return [...sources];
 const current=sources.filter(source=>!source.historical);
 const history=sources.filter(source=>source.historical);
 const groups=new Map<string,Source[]>();
 for(const source of current){
  const group=groups.get(source.versionId)??[];
  group.push(source);groups.set(source.versionId,group);
 }
 const orderedIds=[...new Set([...selection.versionIds,...groups.keys()])];
 const representatives=orderedIds.flatMap(id=>{
  const group=groups.get(id);
  const best=group?.find(source=>source.completeDocument)??group?.[0];
  return best?[best]:[];
 });
 const remainder=current.filter(source=>!representatives.includes(source));
 const selected=new Set(selection.versionIds);
 return [...representatives,...remainder.filter(source=>selected.has(source.versionId)),
  ...remainder.filter(source=>!selected.has(source.versionId)),...history];
}
