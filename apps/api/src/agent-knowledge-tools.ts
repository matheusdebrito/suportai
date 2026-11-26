import {query} from './db.js';
import type {Actor} from './security.js';
import type {Source} from './retrieval.js';
import {hasSecrets,hasInfrastructureSecrets} from './knowledge.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validDocumentId(value:unknown):value is string{
 return typeof value==='string'&&UUID.test(value);
}
export type DocumentDetail={
 id:string;title:string;kind:'ARTICLE'|'PDF';
 versionId:string;versionNumber:number;content:string;truncated:boolean;
};
export type HistoricalVersion={
 id:string;number:number;status:string;isCurrent:boolean;title:string;excerpt:string;
};

/** Read-only tools use the same SQL authorization boundary as RAG. */
export async function getPublishedDocument(actor:Actor,documentId:string):
 Promise<DocumentDetail|null>{
 if(!validDocumentId(documentId))return null;
 const r=await query(`SELECT d.id,d.title,d.kind,v.id AS version_id,
 v.version_number,v.content
 FROM documents d JOIN document_versions v ON v.id=d.current_version_id
 JOIN spaces s ON s.id=d.space_id
 JOIN users u ON u.id=$2 AND u.active AND NOT u.must_change_password AND u.auth_revision=$3 AND u.role=$4
 LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$2
 WHERE d.id=$1 AND d.archived_at IS NULL
 AND v.status='PUBLISHED' AND v.index_status='READY'
 AND (s.visibility='SHARED' OR COALESCE(g.can_read,false)) LIMIT 1`,
 [documentId,actor.id,actor.auth_revision,actor.role]);
 const x=r.rows[0];
 if(!x||hasSecrets(x.title)||hasInfrastructureSecrets(x.content))return null;
 return {id:x.id,title:x.title,kind:x.kind,versionId:x.version_id,
  versionNumber:Number(x.version_number),
  content:x.content.slice(0,10_000),truncated:x.content.length>10_000};
}
export async function getVisibleDocumentVersions(actor:Actor,documentId:string):
 Promise<HistoricalVersion[]>{
 if(!validDocumentId(documentId))return [];
 const r=await query(`SELECT v.id,v.version_number,v.status,v.content,d.title,
 (v.id=d.current_version_id) AS is_current
 FROM documents d JOIN document_versions v ON v.document_id=d.id
 JOIN spaces s ON s.id=d.space_id
 JOIN users u ON u.id=$2 AND u.active AND NOT u.must_change_password AND u.auth_revision=$3 AND u.role=$4
 LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$2
 WHERE d.id=$1 AND d.archived_at IS NULL
 AND d.current_version_id IS NOT NULL
 AND v.status IN ('PUBLISHED','ARCHIVED') AND v.index_status='READY'
 AND (s.visibility='SHARED' OR COALESCE(g.can_read,false))
 ORDER BY (v.id=d.current_version_id) DESC,v.version_number DESC LIMIT 6`,[documentId,actor.id,actor.auth_revision,actor.role]);
 return r.rows.filter(x=>!hasInfrastructureSecrets(x.content)&&!hasSecrets(x.title)).map(x=>({
  id:x.id,number:Number(x.version_number),status:x.status,
  isCurrent:Boolean(x.is_current),title:x.title,excerpt:x.content.slice(0,2400)
 }));
}
export function documentToSource(document:DocumentDetail):Source{
 return {documentId:document.id,versionId:document.versionId,
  versionNumber:document.versionNumber,ordinal:-1,title:document.title,
  content:document.content,score:1,completeDocument:!document.truncated};
}
