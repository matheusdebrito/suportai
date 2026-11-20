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
export async function findSimilarPublished(spaceId:string,title:string,client?:pg.PoolClient):Promise<SimilarArticle[]>{
 const sql='SELECT d.id,d.title,d.kind FROM documents d '+
   'WHERE d.space_id=$1 AND d.archived_at IS NULL AND d.current_version_id IS NOT NULL '+
   'AND (lower(d.title)=lower($2) OR strpos(lower(d.title),lower($2))>0 '+
   'OR strpos(lower($2),lower(d.title))>0 '+
   "OR to_tsvector('portuguese',d.title) @@ plainto_tsquery('portuguese',$2)) "+
   'ORDER BY (lower(d.title)=lower($2)) DESC,d.created_at DESC LIMIT 6';
 const result=client?await client.query(sql,[spaceId,title.trim()]):await query(sql,[spaceId,title.trim()]);
 return result.rows.map(x=>({id:x.id,title:x.title,kind:x.kind}));
}
