export function retrievalMetrics(expected:string[],ranked:string[]){
 const unique=[...new Set(ranked)], relevant=new Set(expected);
 const hits=unique.filter(id=>relevant.has(id)).length;
 const first=unique.findIndex(id=>relevant.has(id));
 return {recall:relevant.size?hits/relevant.size:null,precision:unique.length?hits/unique.length:0,mrr:first<0?0:1/(first+1)};
}
const normalize=(s:string)=>s.toLowerCase().replace(/\[\d+\]/g,'').replace(/\s+/g,' ').trim();
const questionSegmenter=new Intl.Segmenter('pt-BR',{granularity:'sentence'});
const questions=(s:string)=>[...questionSegmenter.segment(s.replace(/\[\d+\]/g,''))].map(x=>normalize(x.segment)).filter(x=>x.endsWith('?'));
function grams(s:string){const w=normalize(s).split(' ');return new Set(w.slice(0,-4).map((_,i)=>w.slice(i,i+5).join(' ')));}
export function episodeQuality(answer:string,article:string,previous:string[]){
 const a=grams(answer), b=grams(article);
 const lines=answer.split('\n').map(normalize).filter(x=>x.length>15);
 const prior=new Set(previous.flatMap(x=>x.split('\n').map(normalize)));
 return {literalOverlap:a.size?[...a].filter(x=>b.has(x)).length/a.size:0,
 repeatedLines:lines.filter(x=>prior.has(x)).length,
 repeatedQuestions:questions(answer).filter(question=>previous.some(p=>questions(p).includes(question))).length,
 boilerplate:/encontrei um procedimento|conforme a fonte|segundo a documentação/i.test(answer),
 escapedMarkdown:/\\[*#]|&(?:#\d+|amp|lt|gt);/.test(answer),
 partialWarning:/não consegui confirmar todos os detalhes/i.test(answer),
 sentenceCount:answer.split(/[.!?]+/).filter(x=>x.trim()).length};
}

/** A full-document citation proves access to a source, not response completeness.
 * Detect explicit server disclaimers; semantic completeness still needs review. */
export function completeProcedureChecks(answer:string,sources:{ordinal?:number}[],mode?:string,coverageConfirmed?:boolean):string[]{
 const failures:string[]=[];
 if(!sources.some(s=>s.ordinal===-1))failures.push('missing_complete_document');
 if(mode!=='complete')failures.push('wrong_support_mode');
 if(coverageConfirmed===false)failures.push('missing_verified_complete_coverage');
 if(/não (?:consegui|consigo|posso|foi possível) (?:confirmar|validar|concluir)[^\n.!?]{0,200}(?:completude|procedimento completo|todos os detalhes|orientação aplicável)|sem confirmar[^\n.!?]{0,160}(?:completude|aplicação)|não descreve as etapas do procedimento|procedimento incompleto como confirmado/i.test(answer))
  failures.push('procedure_completeness_not_confirmed');
 return failures;
}
