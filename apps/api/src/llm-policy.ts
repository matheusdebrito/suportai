export function externalAIApproved(apiKey:string|undefined,approval:string|undefined):boolean {
 return Boolean(apiKey?.trim()) && approval==='true';
}
// Legacy name: this flag now requests a model decision, not a forced RAG lookup.
// Search, clarification, social reply and knowledge proposals remain model choices.
export function shouldForceKnowledgeLookup(message:string):boolean {
 const normalized=message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 // Only pure greetings skip retrieval. A technical request prefixed by "oi"
 // must not silently bypass the evidence lookup or its unsourced warning.
 const greetingText=normalized.replace(/[!,.?]/g,' ').replace(/\s+/g,' ').trim();
 if(/^(?:(?:oi|ola|opa|fala|salve|e ai|eae|beleza|blz|tudo bem|bom dia|boa tarde|boa noite|obrigad[oa]|valeu|tchau|ate logo)(?:\s+|$))+$/.test(greetingText))return false;
 return normalized.length>0;
}
export function groundedReply(answer:string,lookupExpected:boolean,sourceCount:number):string {
 if(!lookupExpected||sourceCount>0)return answer;
 // Model text is not evidence. Do not relay invented internal procedures,
 // addresses, secrets or fabricated citations when retrieval found nothing.
 return 'Não encontrei fontes publicadas e autorizadas para confirmar esse procedimento. '+
   'Uma orientação sem essas fontes seria apenas uma hipótese da IA, não um procedimento interno validado. '+
   'Informe o sistema, o ambiente ou mais detalhes para que eu possa tentar uma busca mais específica.';
}
