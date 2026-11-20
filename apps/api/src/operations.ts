import type {FastifyInstance} from 'fastify';
import {query} from './db.js';
import {requireActor,requireAdmin} from './auth.js';
import {isModelConfigured} from './llm.js';

// Aggregate-only metrics: no prompts, document text, credentials or user emails.
export function registerOperations(app:FastifyInstance){
 app.get('/admin/operations',async req=>{
   const actor=await requireActor(req);
   requireAdmin(actor);
   const [jobs,documents,activity,feedback]=await Promise.all([
     query("SELECT "+
       "count(*) FILTER (WHERE status='PENDING')::int AS pending,"+
       "count(*) FILTER (WHERE status='RUNNING')::int AS running,"+
       "count(*) FILTER (WHERE status='DONE')::int AS completed,"+
       "count(*) FILTER (WHERE status='FAILED')::int AS failed,"+
       "count(*) FILTER (WHERE status='RUNNING' AND updated_at<now()-interval '5 minutes')::int AS stalled,"+
       "max(updated_at) FILTER (WHERE status='DONE') AS last_completed_at "+
       "FROM ingestion_jobs"),
     query("SELECT "+
       "count(*) FILTER (WHERE current_version_id IS NOT NULL AND archived_at IS NULL)::int AS published,"+
       "count(*) FILTER (WHERE archived_at IS NOT NULL)::int AS archived FROM documents"),
     query("SELECT "+
       "count(*) FILTER (WHERE role='assistant' AND created_at>=now()-interval '7 days')::int AS answers_7d,"+
       "count(*) FILTER (WHERE role='user' AND created_at>=now()-interval '7 days')::int AS questions_7d "+
       "FROM messages"),
     query("SELECT "+
       "count(*) FILTER (WHERE rating='GOOD' AND created_at>=now()-interval '7 days')::int AS good_7d,"+
       "count(*) FILTER (WHERE rating='BAD' AND created_at>=now()-interval '7 days')::int AS bad_7d "+
       "FROM feedback")
   ]);
   return {observedAt:new Date().toISOString(),externalAiEnabled:isModelConfigured(),
     ingestion:jobs.rows[0],knowledge:documents.rows[0],
     conversation:activity.rows[0],feedback:feedback.rows[0]};
 });
}
