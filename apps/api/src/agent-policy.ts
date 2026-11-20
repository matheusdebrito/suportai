/**
 * Authorization gate for potentially state-changing AI tools.
 *
 * This is deliberately conservative: a false negative only means the agent
 * asks the user to phrase a knowledge-creation request explicitly. It is NOT
 * a substitute for backend RBAC, draft confirmation, or publication approval.
 */
export function allowsKnowledgeMutation(message:string):boolean{
 const clean=message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim().replace(/^[\s"'«»]+/,'');
 if(!clean || /^(?:nao|nunca|jamais|sem)\b/.test(clean)) return false;
 if(/^(?:como|qual|quais|quando|onde|por que|porque|o que|explique|me explique|mostre|me mostre|liste|pesquise|consulte|busque)\b/.test(clean)) return false;
 const command=/^(?:(?:agente|suportai)[,:]\s*)?(?:por favor[,:]?\s*)?(?:(?:eu\s+)?quero(?:\s+que\s+(?:voce|o agente))?\s+|(?:voce\s+)?pode(?:ria)?(?:\s+voce)?\s+|gostaria\s+que\s+(?:voce\s+)?|preciso\s+que\s+(?:voce\s+)?)?(?:me\s+)?(?:ajude\s+a\s+)?(?:adicion(?:e|ar)|cadastre|registr(?:e|ar)|salv(?:e|ar)|cri(?:e|ar)|atualiz(?:e|ar)|edit(?:e|ar)|corrij(?:a|ir)|aprend(?:a|er)|grav(?:e|ar)|transforme|coloque)\b/;
 return command.test(clean);
}
