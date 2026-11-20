import { query } from './db.js';
import { embedText } from './llm.js';
import {hasSecrets} from './knowledge.js';
import type { Actor } from './security.js';
export type Source={documentId:string;versionId:string;versionNumber:number;title:string;ordinal:number;content:string;score:number};

// PostgreSQL's plainto_tsquery requires every query word to be present. This
// smaller, sanitized OR query is a lexical fallback for natural questions when
// embeddings are disabled or unavailable. All access filters stay in SQL.
const STOP_WORDS=new Set((
 'a as o os um uma uns umas ao aos da das de do dos em no na nos nas '+
 'para por pelo pela pelos pelas com sem e ou que qual quais como quando onde '+
 'porque porquê eu me meu minha meus minhas voce você voces vocês seu sua seus '+
 'suas isso isto esse essa esses essas este esta estes estas mais menos '+
 'pode podem posso poderia me explique diga quero gostaria saber sobre '+
 'por favor favor devo deve devemos do seu da sua'
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
export function safeRetrievedSources(sources:Source[],limit:number):Source[]{
 return sources.filter(x=>!hasSecrets(x.content)).slice(0,Math.max(0,limit));
}
export async function searchKnowledge(actor:Actor, text:string, limit=5):Promise<Source[]> {
  const safe=text.trim().slice(0,500);
  if(!safe) return [];
  const relaxed=relaxedLexicalQuery(safe);
  let vector:string|null=null;
  try { const arr=await embedText(safe);vector=arr?JSON.stringify(arr):null; } catch { /* textual fallback */ }
  const r=await query(`WITH allowed AS (
   SELECT c.version_id,c.ordinal,c.content,c.embedding,c.search_vector,d.id AS document_id,d.title,v.version_number
   FROM knowledge_chunks c JOIN document_versions v ON v.id=c.version_id
   JOIN documents d ON d.id=v.document_id AND d.current_version_id=v.id
   JOIN spaces s ON s.id=d.space_id
   LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$1
   WHERE v.status='PUBLISHED' AND v.index_status='READY' AND d.archived_at IS NULL
   AND (s.visibility='SHARED' OR COALESCE(g.can_read,false))
   ),
   ranked AS (SELECT document_id,version_id,version_number,ordinal,content,title,
   ts_rank_cd(search_vector,plainto_tsquery('simple',$2)) AS lexical,
   CASE WHEN $5::text='' THEN 0::real
     ELSE ts_rank_cd(search_vector,to_tsquery('simple',$5)) END AS relaxed,
   CASE WHEN $3::vector IS NULL OR embedding IS NULL THEN 0::float
     ELSE 1-(embedding <=> $3::vector) END AS semantic
   FROM allowed)
   SELECT *, (lexical*4+relaxed+GREATEST(semantic,0)) AS score FROM ranked
   WHERE lexical>0 OR relaxed>0 OR semantic>0.45
   ORDER BY score DESC LIMIT $4`,[actor.id,safe,vector,Math.min(Math.max(1,limit*3),16),relaxed]);
  return safeRetrievedSources(r.rows.map(x=>({
   documentId:x.document_id,versionId:x.version_id,versionNumber:Number(x.version_number),
   title:x.title,ordinal:x.ordinal,content:x.content,score:Number(x.score)
  })),Math.min(Math.max(1,limit),8));
}
