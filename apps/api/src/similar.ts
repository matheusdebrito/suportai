import type pg from 'pg';
import {query} from './db.js';

export type SimilarArticle={id:string;title:string;kind:'ARTICLE'|'PDF'};
export class SimilarArticlesError extends Error {
 constructor(public readonly matches:SimilarArticle[]){
   super('Há artigos semelhantes no mesmo espaço');
 }
}
export function validDuplicateReason(value:unknown):value is string{
 const reason=typeof value==='string'?value.trim():'';
 return reason.length>=15 && reason.length<=500;
}
export async function findSimilarPublished(spaceId:string,title:string,client?:pg.PoolClient,content=''):Promise<SimilarArticle[]>{
 // Compare substantial article excerpts too, not just titles. A high
 // threshold avoids flagging common short boilerplate as a duplicate.
 const excerpt=content.trim().slice(0,1500);
 const sql='SELECT d.id,d.title,d.kind FROM documents d '+
   'JOIN document_versions v ON v.id=d.current_version_id AND v.status=\'PUBLISHED\' '+
   'WHERE d.space_id=$1 AND d.archived_at IS NULL '+
   'AND (lower(d.title)=lower($2) OR strpos(lower(d.title),lower($2))>0 '+
   'OR strpos(lower($2),lower(d.title))>0 '+
   "OR to_tsvector('portuguese',d.title) @@ plainto_tsquery('portuguese',$2) "+
   'OR similarity(lower(d.title),lower($2))>=0.58 '+
   "OR ($3::text<>'' AND d.kind='ARTICLE' AND length($3)>100 AND length(v.content)>100 "+
   "AND similarity(lower(left(v.content,1500)),lower($3))>=0.77)) "+
   'ORDER BY (lower(d.title)=lower($2)) DESC,'+
   'similarity(lower(d.title),lower($2)) DESC,d.created_at DESC LIMIT 6';
 const params=[spaceId,title.trim(),excerpt];
 const result=client?await client.query(sql,params):await query(sql,params);
 return result.rows.map(x=>({id:x.id,title:x.title,kind:x.kind}));
}
