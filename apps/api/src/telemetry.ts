import type {FastifyInstance,FastifyRequest,FastifyReply} from 'fastify';
import {randomUUID} from 'node:crypto';
import {pool} from './db.js';
import type {AgentMetrics,AgentStopReason} from './agent-budget.js';
import type {InvestigationMetrics} from './agent-investigation-plan.js';

export type TurnTelemetry={
  requestId:string;
  conversationId:string;
  userId:string;
  timestamp:string;
  latencyMs:number;
  httpStatus:number;
  agentMetrics?:AgentMetrics&InvestigationMetrics;
  errorType?:string;
  idempotentHit?:boolean;
  stopReason?:AgentStopReason;
  clarificationRequested?:boolean;
  abstained?:boolean;
};

export function getOrCreateRequestId(req:FastifyRequest):string{
  return (req.headers['x-request-id'] as string)||req.id||randomUUID();
}

export function logTurnTelemetry(req:FastifyRequest,telemetry:TurnTelemetry){
  req.log.info({telemetry},'Turn completed');
}

export interface AggregatedTelemetry{
  period:{from:string;to:string};
  requests:{total:number;p50Ms:number;p95Ms:number;p99Ms:number};
  stopReasons:Record<AgentStopReason,number>;
  clarificationRate:number;
  abstentionRate:number;
  errorRates:Record<string,number>;
  idempotentHitRate:number;
  estimatedCostUsd:number;
}

const STOP_REASONS:AgentStopReason[]=[
  'answered','clarified','no_evidence','model_interrupted','unsafe_answer',
  'provider_failure','search_unavailable','step_budget','time_budget',
  'token_budget','repeated_search','tool_budget','read_timeout','model_timeout',
  'source_inaccessible','source_conflict','other'
];

export async function computeAggregatedTelemetry(
  from:Date,to:Date
):Promise<AggregatedTelemetry>{
  const result=await pool.query(
    `SELECT
       count(*)::int AS total,
       percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms)::numeric AS p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric AS p95,
       percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms)::numeric AS p99
     FROM request_telemetry
     WHERE timestamp >= $1 AND timestamp <= $2`,
    [from,to]
  );
  const totals=result.rows[0];

  const stopReasonsResult=await pool.query(
    `SELECT stop_reason,count(*)::int AS count
     FROM request_telemetry
     WHERE timestamp >= $1 AND timestamp <= $2 AND stop_reason IS NOT NULL
     GROUP BY stop_reason`,
    [from,to]
  );
  const stopReasons:Record<AgentStopReason,number>={} as Record<AgentStopReason,number>;
  for(const r of STOP_REASONS)stopReasons[r]=0;
  for(const row of stopReasonsResult.rows)stopReasons[row.stop_reason as AgentStopReason]=row.count;

  const clarificationResult=await pool.query(
    `SELECT count(*)::int AS total,
       count(*) FILTER (WHERE clarification_requested)::int AS clarifications,
       count(*) FILTER (WHERE abstained)::int AS abstentions,
       count(*) FILTER (WHERE idempotent_hit)::int AS idempotent_hits,
       count(*) FILTER (WHERE http_status >= 400)::int AS errors
     FROM request_telemetry
     WHERE timestamp >= $1 AND timestamp <= $2`,
    [from,to]
  );
  const agg=clarificationResult.rows[0];

  const errorRatesResult=await pool.query(
    `SELECT http_status,count(*)::int AS count
     FROM request_telemetry
     WHERE timestamp >= $1 AND timestamp <= $2 AND http_status >= 400
     GROUP BY http_status`,
    [from,to]
  );
  const errorRates:Record<string,number>={};
  for(const row of errorRatesResult.rows)errorRates[row.http_status.toString()]=row.count;

  const total=totals.total??0;
  const clarificationRate=total>0?agg.clarifications/total:0;
  const abstentionRate=total>0?agg.abstentions/total:0;
  const idempotentHitRate=total>0?agg.idempotent_hits/total:0;

  const costResult=await pool.query(
    `SELECT
       sum(prompt_tokens)::bigint AS prompt_sum,
       sum(completion_tokens)::bigint AS completion_sum
     FROM request_telemetry
     WHERE timestamp >= $1 AND timestamp <= $2`,
    [from,to]
  );
  const cost=costResult.rows[0];
  const promptTokens=cost.prompt_sum??0;
  const completionTokens=cost.completion_sum??0;
  const estimatedCostUsd=(promptTokens*0.00000015)+(completionTokens*0.0000006);

  return{
    period:{from:from.toISOString(),to:to.toISOString()},
    requests:{
      total,
      p50Ms:Number(totals.p50??0),
      p95Ms:Number(totals.p95??0),
      p99Ms:Number(totals.p99??0)
    },
    stopReasons,
    clarificationRate,
    abstentionRate,
    errorRates,
    idempotentHitRate,
    estimatedCostUsd
  };
}

export function registerTelemetryHooks(app:FastifyInstance){
  app.addHook('onRequest',async(req:FastifyRequest)=>{
    req.id=getOrCreateRequestId(req);
    req.headers['x-request-id']=req.id;
    (req as any).telemetryStart=Date.now();
  });

  app.addHook('onResponse',async(req:FastifyRequest,reply:FastifyReply)=>{
    const start=(req as any).telemetryStart as number|undefined;
    if(!start)return;
    const latencyMs=Date.now()-start;
    reply.header('X-Request-Id',req.id);
  });
}

export async function recordTurnTelemetry(data:{
  requestId:string;
  conversationId:string;
  userId:string;
  latencyMs:number;
  httpStatus:number;
  agentMetrics?:AgentMetrics&InvestigationMetrics;
  errorType?:string;
  idempotentHit?:boolean;
}):Promise<void>{
  const stopReason=data.agentMetrics?.stopReason;
  const clarificationRequested=!!(data.agentMetrics as any)?.clarificationRequests;
  const abstained=stopReason==='no_evidence'||stopReason==='unsafe_answer'||stopReason==='source_conflict';
  const promptTokens=data.agentMetrics?.promptTokens??0;
  const completionTokens=data.agentMetrics?.completionTokens??0;

  await pool.query(
    `INSERT INTO request_telemetry(
       request_id,conversation_id,user_id,timestamp,latency_ms,http_status,
       stop_reason,clarification_requested,abstained,idempotent_hit,
       error_type,prompt_tokens,completion_tokens
     ) VALUES($1,$2,$3,now(),$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      data.requestId,
      data.conversationId,
      data.userId,
      data.latencyMs,
      data.httpStatus,
      stopReason??null,
      clarificationRequested,
      abstained,
      data.idempotentHit??false,
      data.errorType??null,
      promptTokens,
      completionTokens
    ]
  ).catch(err=>{
    console.error('Failed to record telemetry:',err);
  });
}