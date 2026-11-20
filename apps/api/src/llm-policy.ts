import {allowsKnowledgeMutation} from './agent-policy.js';

export function externalAIApproved(apiKey:string|undefined,approval:string|undefined):boolean {
 return Boolean(apiKey?.trim()) && approval==='true';
}
export function shouldForceKnowledgeLookup(message:string):boolean {
 const normalized=message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 if(allowsKnowledgeMutation(message))return false;
 // Only pure greetings skip retrieval. A technical request prefixed by "oi"
 // must not silently bypass the evidence lookup or its unsourced warning.
 const greetingText=normalized.replace(/[!,.?]/g,' ').replace(/\s+/g,' ').trim();
 if(/^(?:(?:oi|ola|bom dia|boa tarde|boa noite|obrigad[oa]|valeu|tchau|ate logo)(?:\s+|$))+$/.test(greetingText))return false;
 return normalized.length>0;
}
export function groundedReply(answer:string,lookupExpected:boolean,sourceCount:number):string {
 if(!lookupExpected||sourceCount>0)return answer;
 return 'Não há referência publicada do cérebro associada a esta resposta. O texto abaixo é uma orientação geral da IA, não um procedimento interno validado.\n\n'+answer;
}
