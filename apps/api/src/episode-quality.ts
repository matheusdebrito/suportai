export function retrievalMetrics(expected:string[],ranked:string[]){
 const unique=[...new Set(ranked)], relevant=new Set(expected);
 const hits=unique.filter(id=>relevant.has(id)).length;
 const first=unique.findIndex(id=>relevant.has(id));
 return {recall:relevant.size?hits/relevant.size:null,precision:unique.length?hits/unique.length:0,mrr:first<0?0:1/(first+1)};
}
const normalize=(s:string)=>s.toLowerCase().replace(/\[\d+\]/g,'').replace(/\s+/g,' ').trim();
function grams(s:string){const w=normalize(s).split(' ');return new Set(w.slice(0,-4).map((_,i)=>w.slice(i,i+5).join(' ')));}
export function episodeQuality(answer:string,article:string,previous:string[]){
 const a=grams(answer), b=grams(article);
 const lines=answer.split('\n').map(normalize).filter(x=>x.length>15);
 const prior=new Set(previous.flatMap(x=>x.split('\n').map(normalize)));
 return {literalOverlap:a.size?[...a].filter(x=>b.has(x)).length/a.size:0,
 repeatedLines:lines.filter(x=>prior.has(x)).length,
 boilerplate:/encontrei um procedimento|conforme a fonte|segundo a documentação/i.test(answer),
 escapedMarkdown:/\\[*#]|&(?:#\d+|amp|lt|gt);/.test(answer),
 partialWarning:/não consegui confirmar todos os detalhes/i.test(answer),
 sentenceCount:answer.split(/[.!?]+/).filter(x=>x.trim()).length};
}
