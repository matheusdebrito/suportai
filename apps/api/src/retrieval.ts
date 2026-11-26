import { query } from './db.js';
import { embedText } from './llm.js';
import {hasSecrets,hasInfrastructureSecrets} from './knowledge.js';
import type { Actor } from './security.js';
export type Source={documentId:string;versionId:string;versionNumber:number;title:string;ordinal:number;content:string;score:number;historical?:true;completeDocument?:boolean;excerpts?:string[]};
export type Candidate=Source&{semantic:number};
export const DEFAULT_RERANK_POLICY={semanticMinimum:0.56,diversityPenalty:0.18};
export type RerankPolicy=typeof DEFAULT_RERANK_POLICY;

// PostgreSQL's plainto_tsquery requires every query word to be present. This
// smaller, sanitized OR query is a lexical fallback for natural questions when
// embeddings are disabled or unavailable. All access filters stay in SQL.
const STOP_WORDS=new Set((
 'a as o os um uma uns umas ao aos da das de do dos em no na nos nas '+
 'para por pelo pela pelos pelas com sem e ou que qual quais como quando onde '+
 'porque porquê eu me meu minha meus minhas voce você voces vocês seu sua seus '+
 'suas isso isto esse essa esses essas este esta estes estas mais menos '+
 'pode podem posso poderia me explique diga quero gostaria saber sobre '+
 'por favor favor devo deve devemos do seu da sua preciso saber realmente não nao sei'
).split(/\s+/));
export function relaxedLexicalQuery(text:string):string{
 const words=text.toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]{2,}/gu)??[];
 const unique=new Set<string>();
 for(const word of words){
   if(!STOP_WORDS.has(word)&&word.length<=40)unique.add(word);
   if(unique.size===8)break;
 }
 // No raw user-provided operators can reach to_tsquery.
 return [...unique].join(' | ');
}
// Defense in depth for articles published before secret scanning was tightened.
export function safeRetrievedSources<T extends Source>(sources:T[],limit:number):T[]{
 return sources.filter(x=>!hasSecrets(x.title)&&!hasInfrastructureSecrets(x.content)).slice(0,Math.max(0,limit));
}
const genericTerms=new Set('procedimento procedimentos diagnostico diagnosticar problema problemas erro erros falha falhas ajuda corrigir verificar preciso saber empresa sistema sintoma informacao informacoes orientacao sobre consultar'.split(' '));
function words(value:string):string[]{
 return value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)??[];
}

/** Rerank only the authorized, bounded candidate pool. Retain strong semantic-only hits. */
export function rerankKnowledgeCandidates(text:string,candidates:Candidate[],limit:number,policy:RerankPolicy=DEFAULT_RERANK_POLICY):Source[]{
 const terms=[...new Set(words(text).filter(word=>!STOP_WORDS.has(word)&&!genericTerms.has(word)))].slice(0,12);
 const selected:Source[]=[];
 const counts=new Map<string,number>();
 const ranked=safeRetrievedSources(candidates,candidates.length).flatMap(source=>{
   const {semantic}=source;
   const title=new Set(words(source.title));
   const body=new Set(words(source.content));
   const titleHits=terms.filter(term=>title.has(term)).length;
   const bodyHits=terms.filter(term=>body.has(term)).length;
   if(!titleHits&&!bodyHits&&semantic<policy.semanticMinimum)return [];
   const coverage=(titleHits*0.75+bodyHits)/Math.max(1,terms.length);
   const score=coverage+Math.log1p(Math.max(0,source.score))*0.12+Math.max(0,semantic)*0.35;
   return [{source,score}];
 });
 while(ranked.length&&selected.length<limit){
   ranked.sort((a,b)=>(b.score-(counts.get(b.source.documentId)??0)*policy.diversityPenalty)-
     (a.score-(counts.get(a.source.documentId)??0)*policy.diversityPenalty));
   const {source}=ranked.shift()!;
   if(selected.some(picked=>picked.versionId===source.versionId&&picked.content===source.content))continue;
   const {semantic:_,...publicSource}=source;
   selected.push(publicSource);
   counts.set(source.documentId,(counts.get(source.documentId)??0)+1);
 }
 return selected;
}

export async function retrieveKnowledgeCandidates(actor:Actor,text:string,limit:number,vector:string|null):Promise<Candidate[]>{
  // Check the complete input before truncation. Model-generated search
  // queries are untrusted and must never forward credentials to embeddings.
  if(hasSecrets(text))return [];
  const safe=text.trim().slice(0,500);
  if(!safe) return [];
  const relaxed=relaxedLexicalQuery(safe);
  const r=await query(`WITH allowed AS (
   SELECT c.version_id,c.ordinal,c.content,c.embedding,c.search_vector,
     to_tsvector('simple',d.title) AS title_vector,d.id AS document_id,d.title,v.version_number
   FROM knowledge_chunks c JOIN document_versions v ON v.id=c.version_id
   JOIN documents d ON d.id=v.document_id AND d.current_version_id=v.id
   JOIN spaces s ON s.id=d.space_id
   JOIN users u ON u.id=$1 AND u.active AND NOT u.must_change_password AND u.auth_revision=$6 AND u.role=$7
   LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$1
   WHERE v.status='PUBLISHED' AND v.index_status='READY' AND d.archived_at IS NULL
   AND (s.visibility='SHARED' OR COALESCE(g.can_read,false))
   ),
   ranked AS (SELECT document_id,version_id,version_number,ordinal,content,title,
   ts_rank_cd(search_vector,plainto_tsquery('simple',$2)) AS lexical,
   CASE WHEN $5::text='' THEN 0::real
     ELSE ts_rank_cd(search_vector,to_tsquery('simple',$5)) END AS relaxed,
   ts_rank_cd(title_vector,plainto_tsquery('simple',$2)) AS title_lexical,
   CASE WHEN $5::text='' THEN 0::real
     ELSE ts_rank_cd(title_vector,to_tsquery('simple',$5)) END AS title_relaxed,
   CASE WHEN $3::vector IS NULL OR embedding IS NULL THEN 0::float
     ELSE 1-(embedding <=> $3::vector) END AS semantic
   FROM allowed)
   SELECT *, (lexical*4+relaxed+title_lexical*6+title_relaxed*2+
     GREATEST(semantic,0)) AS score FROM ranked
   WHERE lexical>0 OR relaxed>0 OR title_lexical>0 OR title_relaxed>0 OR semantic>0.45
   ORDER BY score DESC, document_id, ordinal LIMIT $4`,[actor.id,safe,vector,Math.min(Math.max(1,limit*3),16),relaxed,actor.auth_revision,actor.role]);
  return r.rows.map(x=>({
   documentId:x.document_id,versionId:x.version_id,versionNumber:Number(x.version_number),
   title:x.title,ordinal:x.ordinal,content:x.content,score:Number(x.score),semantic:Number(x.semantic)
  }));
}

export async function searchKnowledge(actor:Actor,text:string,limit=5):Promise<Source[]>{
 if(hasSecrets(text)||!text.trim())return [];
 let vector:string|null=null;
 try{const embedding=await embedText(text.trim().slice(0,500));vector=embedding?JSON.stringify(embedding):null;}
 catch{ /* Textual fallback. */ }
 const candidates=await retrieveKnowledgeCandidates(actor,text,limit,vector);
 const cap=Math.min(Math.max(1,limit),8);
 const ranked=rerankKnowledgeCandidates(text.trim().slice(0,500),candidates,cap);
 if(!ranked.length||cap<2)return ranked;
 // Reserve at most two slots for adjacent evidence; never expand across versions.
 const seeds=ranked.slice(0,Math.max(1,cap-2));
 const anchor=seeds[0];
 if(!/\n|procedimento|configur|etapa|passo/i.test(anchor.content+' '+text))return ranked;
 const neighbors=await query(`SELECT d.id AS document_id,v.id AS version_id,v.version_number,d.title,c.ordinal,c.content
 FROM knowledge_chunks c JOIN document_versions v ON v.id=c.version_id
 JOIN documents d ON d.current_version_id=v.id AND d.id=v.document_id
 JOIN spaces s ON s.id=d.space_id
 JOIN users u ON u.id=$1 AND u.active AND NOT u.must_change_password AND u.auth_revision=$2 AND u.role=$3
 LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$1
 WHERE v.id=$4 AND c.ordinal IN ($5::integer-1,$5::integer+1) AND v.status='PUBLISHED' AND v.index_status='READY'
 AND d.archived_at IS NULL AND (s.visibility='SHARED' OR COALESCE(g.can_read,false))
 ORDER BY c.ordinal`,[actor.id,actor.auth_revision,actor.role,anchor.versionId,anchor.ordinal]);
 const adjacent=safeRetrievedSources(neighbors.rows.map(x=>({documentId:x.document_id,versionId:x.version_id,versionNumber:Number(x.version_number),title:x.title,ordinal:Number(x.ordinal),content:x.content,score:0})),2);
 const result:Source[]=[];
 for(const source of [...seeds,...adjacent,...ranked]){
  if(!result.some(x=>x.versionId===source.versionId&&x.ordinal===source.ordinal))result.push(source);
  if(result.length===cap)break;
 }
 const positions=result.map((source,index)=>({source,index})).filter(x=>x.source.versionId===anchor.versionId);
 const ordered=positions.map(x=>x.source).sort((a,b)=>a.ordinal-b.ordinal);
 positions.forEach((position,index)=>{result[position.index]=ordered[index];});
 return result;
}
