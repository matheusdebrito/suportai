import { query } from './db.js';
import { embedText } from './llm.js';
import {hasSecrets} from './knowledge.js';
import type { Actor } from './security.js';
export type Source={documentId:string;versionId:string;versionNumber:number;title:string;ordinal:number;content:string;score:number};
// Defense in depth for articles published before secret scanning was tightened.
export function safeRetrievedSources(sources:Source[],limit:number):Source[]{
 return sources.filter(x=>!hasSecrets(x.content)).slice(0,Math.max(0,limit));
}
export async function searchKnowledge(actor:Actor, text:string, limit=5):Promise<Source[]> {
  const safe=text.trim().slice(0,500);
  if(!safe) return [];
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
   CASE WHEN $3::vector IS NULL OR embedding IS NULL THEN 0::float
     ELSE 1-(embedding <=> $3::vector) END AS semantic
   FROM allowed)
   SELECT *, (lexical*2+GREATEST(semantic,0)) AS score FROM ranked
   WHERE lexical>0 OR semantic>0.45 ORDER BY score DESC LIMIT $4`,[actor.id,safe,vector,Math.min(Math.max(1,limit*3),16)]);
  return safeRetrievedSources(r.rows.map(x=>({
   documentId:x.document_id,versionId:x.version_id,versionNumber:Number(x.version_number),
   title:x.title,ordinal:x.ordinal,content:x.content,score:Number(x.score)
  })),Math.min(Math.max(1,limit),8));
}
