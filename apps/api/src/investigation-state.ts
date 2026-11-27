import {pool,transaction} from './db.js';
import {validDocumentId} from './agent-knowledge-tools.js';
import {hasSecrets} from './knowledge.js';
import {requireCurrentActor,type Actor} from './security.js';
import type {PoolClient} from 'pg';

export type InvestigationDraft={
  topic:string;
  supportPreference?:'adaptive'|'guided'|'complete';
  equipmentOrSystem?:string|null;
  environment?:string|null;
  reportedFacts:string[];
  hypotheses:string[];
  openQuestions:string[];
  tests:{content:string;result?:string|null}[];
  sourceVersionIds:string[];
};

type InvestigationMetadata={id:string;revision:number;lastActivityAt:Date};
export type InvestigationState=InvestigationDraft&InvestigationMetadata;
type InvestigationTarget={id:string;expectedRevision:number|null};
type SaveResult={status:'saved';state:InvestigationState}|
  {status:'not_found'|'conflict'|'source_unavailable'};

const retentionInterval="interval '720 hours'";
const activeInvestigation=`i.last_activity_at > statement_timestamp() - ${retentionInterval}`;
export const INVESTIGATION_CLEANUP_BATCH_SIZE=100;

export async function purgeExpiredInvestigations(client:Pick<PoolClient,'query'>=pool):Promise<number>{
  const result=await client.query(`WITH expired AS (
    SELECT id FROM investigations
    WHERE last_activity_at < now() - ${retentionInterval}
    ORDER BY last_activity_at,id LIMIT $1 FOR UPDATE SKIP LOCKED
  )
  DELETE FROM investigations i USING expired WHERE i.id=expired.id`,[INVESTIGATION_CLEANUP_BATCH_SIZE]);
  return result.rowCount??0;
}

export const visibleInvestigationVersions=(actorParameter:'$1'|'$3')=>`FROM document_versions v JOIN documents d ON d.id=v.document_id
  JOIN spaces s ON s.id=d.space_id
  LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=${actorParameter}
  WHERE d.archived_at IS NULL AND d.current_version_id IS NOT NULL
    AND v.status IN ('PUBLISHED','ARCHIVED') AND v.index_status='READY'
    AND (s.visibility='SHARED' OR COALESCE(g.can_read,false))`;
const visibleInvestigation=`i.user_id=$1 AND i.conversation_id=$2 AND i.auth_revision=$3
  AND u.auth_revision=$3 AND u.role=$4 AND u.active AND NOT u.must_change_password
  AND ${activeInvestigation}
  AND NOT EXISTS (
    SELECT 1 FROM investigation_sources src WHERE src.investigation_id=i.id
      AND NOT EXISTS (SELECT 1 ${visibleInvestigationVersions('$1')} AND v.id=src.version_id)
  )`;

export type InvestigationSubject=Pick<InvestigationState,'id'|'topic'|'equipmentOrSystem'|'environment'|'supportPreference'>;
export async function listInvestigationSubjects(actor:Actor,conversationId:string):Promise<InvestigationSubject[]>{
  const result=await pool.query<InvestigationSubject>(`SELECT i.id,i.topic,i.equipment_or_system AS "equipmentOrSystem",i.environment,i.support_preference AS "supportPreference"
    FROM investigations i JOIN users u ON u.id=i.user_id WHERE ${visibleInvestigation}
    ORDER BY i.last_activity_at DESC,i.id DESC LIMIT 40`,[actor.id,conversationId,actor.auth_revision,actor.role]);
  return result.rows;
}

export async function readInvestigationState(actor:Actor,conversationId:string,id:string):Promise<InvestigationState|null>{
  const result=await pool.query<InvestigationState>(`SELECT i.id,i.revision,i.last_activity_at AS "lastActivityAt",
    i.topic,i.equipment_or_system AS "equipmentOrSystem",i.environment,i.support_preference AS "supportPreference",
    COALESCE(notes.facts,'{}') AS "reportedFacts",COALESCE(notes.hypotheses,'{}') AS hypotheses,
    COALESCE(notes.questions,'{}') AS "openQuestions",COALESCE(notes.tests,'[]') AS tests,
    ARRAY(SELECT src.version_id FROM investigation_sources src
      WHERE src.investigation_id=i.id ORDER BY src.position) AS "sourceVersionIds"
    FROM investigations i JOIN users u ON u.id=i.user_id
    CROSS JOIN LATERAL (
      SELECT array_agg(n.content ORDER BY n.position) FILTER (WHERE n.kind='REPORTED_FACT') AS facts,
        array_agg(n.content ORDER BY n.position) FILTER (WHERE n.kind='HYPOTHESIS') AS hypotheses,
        array_agg(n.content ORDER BY n.position) FILTER (WHERE n.kind='OPEN_QUESTION') AS questions,
        jsonb_agg(jsonb_build_object('content',n.content,'result',n.test_result) ORDER BY n.position)
          FILTER (WHERE n.kind='TEST') AS tests
      FROM investigation_notes n WHERE n.investigation_id=i.id
    ) notes
    WHERE ${visibleInvestigation} AND i.id=$5`,[actor.id,conversationId,actor.auth_revision,actor.role,id]);
  return result.rows[0]??null;
}

/** Save a complete snapshot. Include every source on which the stored notes depend. */
export async function saveInvestigationState(
  actor:Actor,conversationId:string,draft:InvestigationDraft,target:InvestigationTarget|null=null,client?:PoolClient
):Promise<SaveResult>{
  const update=target && target.expectedRevision!==null ? {id:target.id,expectedRevision:target.expectedRevision} : null;
  const tests=draft.tests.map(test=>({content:test.content,result:test.result??null}));
  const groups=[
    {kind:'REPORTED_FACT',entries:draft.reportedFacts.map(content=>({content,result:null}))},
    {kind:'HYPOTHESIS',entries:draft.hypotheses.map(content=>({content,result:null}))},
    {kind:'OPEN_QUESTION',entries:draft.openQuestions.map(content=>({content,result:null}))},
    {kind:'TEST',entries:tests}
  ];
  const sourceVersionIds=draft.sourceVersionIds.map(id=>id.toLowerCase());
  const state={...draft,sourceVersionIds,equipmentOrSystem:draft.equipmentOrSystem??null,
    environment:draft.environment??null,supportPreference:draft.supportPreference??'adaptive',tests};
  const details=[state.equipmentOrSystem,state.environment];
  const notes=groups.flatMap(({kind,entries})=>entries.map(({content,result},index)=>({kind,position:index+1,content,result})));
  if(!['adaptive','guided','complete'].includes(state.supportPreference)||!draft.topic.trim() || draft.topic.length>160 || details.some(value=>value!==null && value.length>160) ||
     groups.some(group=>group.entries.length>12) || notes.some(note=>!note.content.trim() || note.content.length>400 ||
       (note.result!==null && (!note.result.trim() || note.result.length>400))) ||
     sourceVersionIds.length>12 || sourceVersionIds.some(id=>!validDocumentId(id)) ||
     new Set(sourceVersionIds).size!==sourceVersionIds.length ||
     (update && (!Number.isInteger(update.expectedRevision) || update.expectedRevision<1))){
    throw Object.assign(new Error('Estado de investigação inválido'),{statusCode:400});
  }
  const text=[draft.topic,...details,...notes.flatMap(note=>[note.content,note.result])].join('\n');
  if(hasSecrets(text) || /(?:^|\n)\s*%PDF-/.test(text)){
    throw Object.assign(new Error('Possível credencial ou conteúdo bruto de PDF no estado da investigação'),{statusCode:422});
  }

  const persist=async (client:PoolClient):Promise<SaveResult>=>{
    await requireCurrentActor(client,actor);
    const owner=await client.query('SELECT id FROM conversations WHERE id=$1 AND user_id=$2 FOR SHARE',[conversationId,actor.id]);
    if(!owner.rowCount)return {status:'not_found'};

    const scope=[actor.id,conversationId,actor.auth_revision,update?.id];
    let previousSources:(string|null)[]=[];
    if(update){
      const existing=await client.query<{revision:number}>(`SELECT i.revision FROM investigations i
        WHERE i.user_id=$1 AND i.conversation_id=$2 AND i.auth_revision=$3 AND i.id=$4
          AND ${activeInvestigation} FOR UPDATE`,scope);
      if(!existing.rowCount)return {status:'not_found'};
      if(existing.rows[0].revision!==update.expectedRevision)return {status:'conflict'};
      const sources=await client.query<{version_id:string|null}>(
        'SELECT version_id FROM investigation_sources WHERE investigation_id=$1',[update.id]);
      previousSources=sources.rows.map(source=>source.version_id);
    }
    const requiredSources=[...new Set([...previousSources,...sourceVersionIds])];
    if(requiredSources.includes(null))return {status:'source_unavailable'};
    if(requiredSources.length){
      const visible=await client.query(`SELECT v.id ${visibleInvestigationVersions('$1')} AND v.id=ANY($2::uuid[])
        ORDER BY d.id,v.id FOR SHARE OF d,v`,[actor.id,requiredSources]);
      if(visible.rowCount!==requiredSources.length)return {status:'source_unavailable'};
    }

    const fields=[state.topic,state.equipmentOrSystem,state.environment,state.supportPreference];
    const saved=update
      ? await client.query<InvestigationMetadata>(`UPDATE investigations i SET topic=$6,equipment_or_system=$7,environment=$8,support_preference=$9,
          revision=i.revision+1,last_activity_at=clock_timestamp()
          WHERE i.user_id=$1 AND i.conversation_id=$2 AND i.auth_revision=$3 AND i.id=$4 AND i.revision=$5
            AND ${activeInvestigation} RETURNING id,revision,last_activity_at AS "lastActivityAt"`,
        [...scope,update.expectedRevision,...fields])
      : await client.query<InvestigationMetadata>(`INSERT INTO investigations(user_id,conversation_id,auth_revision,topic,equipment_or_system,environment,support_preference,last_activity_at,id)
          VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp(),COALESCE($8::uuid,gen_random_uuid())) RETURNING id,revision,last_activity_at AS "lastActivityAt"`,
        [actor.id,conversationId,actor.auth_revision,...fields,target?.id??null]);
    const metadata=saved.rows[0];
    if(!metadata)return {status:'not_found'};
    if(update){
      await client.query('DELETE FROM investigation_notes WHERE investigation_id=$1',[metadata.id]);
      await client.query('DELETE FROM investigation_sources WHERE investigation_id=$1',[metadata.id]);
    }
    await client.query(`INSERT INTO investigation_notes(investigation_id,kind,position,content,test_result)
      SELECT $1,n.kind,n.position,n.content,n.result
      FROM jsonb_to_recordset($2::jsonb) AS n(kind text,position smallint,content text,result text)`,[metadata.id,JSON.stringify(notes)]);
    await client.query(`INSERT INTO investigation_sources(investigation_id,version_id,position)
      SELECT $1,src.version_id,src.position FROM unnest($2::uuid[]) WITH ORDINALITY AS src(version_id,position)`,
      [metadata.id,sourceVersionIds]);
    return {status:'saved',state:{...state,...metadata}};
  };
  return client ? persist(client) : transaction(persist);
}
