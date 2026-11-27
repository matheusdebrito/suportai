import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {client} from './llm.js';
import {pool,query,transaction} from './db.js';
import {DEFAULT_CANDIDATE_SEMANTIC_MINIMUM,DEFAULT_RERANK_POLICY,rerankKnowledgeCandidates,retrieveKnowledgeCandidates,type RerankPolicy} from './retrieval.js';
import {retrievalMetrics} from './episode-quality.js';
import type {Actor} from './security.js';

type Split='pilot'|'holdout';
type DocumentFixture={id:string;title:string;domain:string;status:'published'|'revoked';access:'shared'|'restricted';version:number;current:boolean;chunks:string[]};
type PositiveCase={id:string;category:string;domain:string;split:Split;query:string;candidateDocumentIds:string[];expectedRelevantDocumentIds:string[];expectedRelevantChunks:string[]};
type SecurityCase={id:string;threat:string;query:string;candidateDocumentIds:string[];expectedBehavior:string};
type Corpus={schemaVersion:number;corpusId:string;frozen:boolean;positive:{documents:DocumentFixture[];cases:PositiveCase[]};security:{documents:DocumentFixture[];cases:SecurityCase[]}};
type Row={id:string;category:string;domain:string;split:Split;recallAt5:number|null;precisionReturnedAt5:number;precisionAt5:number;mrr:number;chunkCoverage:number;correctCurrentVersion:boolean;incompatibleDocuments:number;returned:number;latencyMs:number;candidates:{documentId:string|null;versionId:string;ordinal:number;score:number;semantic:number}[];ranked:{documentId:string|null;versionId:string;ordinal:number;score:number}[]};

const quantile=(values:number[],p:number)=>values.length?[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor((values.length-1)*p))]:null;
const average=(values:number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
function aggregate(rows:Row[]){
 const values=(key:'precisionReturnedAt5'|'precisionAt5'|'mrr'|'chunkCoverage'|'latencyMs')=>rows.map(row=>row[key]);
 const recalls=rows.map(row=>row.recallAt5).filter((value):value is number=>value!==null);
 const latencies=values('latencyMs');
 return {cases:rows.length,recallAt5:average(recalls),precisionReturnedAt5:average(values('precisionReturnedAt5')),precisionAt5:average(values('precisionAt5')),mrr:average(values('mrr')),chunkCoverage:average(values('chunkCoverage')),correctCurrentVersionRate:average(rows.map(row=>row.correctCurrentVersion?1:0)),incompatibleDocuments:rows.reduce((sum,row)=>sum+row.incompatibleDocuments,0),latencyMs:{average:average(latencies),median:quantile(latencies,0.5),p95:quantile(latencies,0.95)}};
}
function scoreDistribution(rows:Row[]){
 const scores=rows.flatMap(row=>row.candidates.map(candidate=>candidate.score));
 const semantic=rows.flatMap(row=>row.candidates.map(candidate=>candidate.semantic));
 return {count:scores.length,score:{min:scores.length?Math.min(...scores):null,median:quantile(scores,0.5),p95:quantile(scores,0.95),max:scores.length?Math.max(...scores):null},semantic:{min:semantic.length?Math.min(...semantic):null,median:quantile(semantic,0.5),p95:quantile(semantic,0.95),max:semantic.length?Math.max(...semantic):null}};
}
async function embeddings(inputs:string[]){
 if(!client)throw new Error('Explicit external AI authorization is required');
 const vectors:number[][]=[];let promptTokens=0,totalTokens=0,calls=0;
 const started=performance.now();
 for(let offset=0;offset<inputs.length;offset+=64){
  const response=await client.embeddings.create({model:process.env.OPENAI_EMBED_MODEL||'text-embedding-3-small',input:inputs.slice(offset,offset+64),dimensions:1536});
  vectors.push(...response.data.sort((a,b)=>a.index-b.index).map(item=>item.embedding));calls++;
  promptTokens+=response.usage?.prompt_tokens??0;totalTokens+=response.usage?.total_tokens??0;
 }
 return {vectors,usage:{providerReported:true,calls,promptTokens,totalTokens,latencyMs:performance.now()-started}};
}

type BaselineOptions={split?:Split|'all';candidateSemanticMinimum?:number;rerankPolicy?:RerankPolicy;includeSecurity?:boolean};
export async function runRagCorpusBaseline(corpusPath:string,outputPath:string,commit:string,options:BaselineOptions={}){
 if(process.env.NODE_ENV!=='test'||!process.env.TEST_DATABASE_URL||process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw new Error('Isolated test database required');
 const corpus=JSON.parse(readFileSync(corpusPath,'utf8')) as Corpus;
 if(!corpus.frozen||corpus.positive.cases.length!==100||corpus.security.cases.length!==20)throw new Error('Frozen calibration corpus v2 required');
 const split=options.split??'all',candidateSemanticMinimum=options.candidateSemanticMinimum??DEFAULT_CANDIDATE_SEMANTIC_MINIMUM,rerankPolicy=options.rerankPolicy??DEFAULT_RERANK_POLICY;
 if(!['pilot','holdout','all'].includes(split)||!Number.isFinite(candidateSemanticMinimum)||candidateSemanticMinimum<0||candidateSemanticMinimum>1)throw new Error('Invalid baseline options');
 const positiveCases=corpus.positive.cases.filter(item=>split==='all'||item.split===split);
 const securityCases=options.includeSecurity===false?[]:corpus.security.cases;
 const actor:Actor={id:randomUUID(),role:'USER',auth_revision:0,must_change_password:false};
 const activeDocuments:string[]=[];
 const allDocuments=[...corpus.positive.documents,...corpus.security.documents];
 const embeddedDocuments=allDocuments.filter(document=>document.current&&document.status==='published');
 const chunkKeys=embeddedDocuments.flatMap(document=>document.chunks.map((_,ordinal)=>`${document.id}:${ordinal}`));
 const chunkInputs=embeddedDocuments.flatMap(document=>document.chunks);
 const documentEmbeddings=await embeddings(chunkInputs),queryEmbeddings=await embeddings([...positiveCases.map(item=>item.query),...securityCases.map(item=>item.query)]);
 const vectorByChunk=new Map(chunkKeys.map((key,index)=>[key,documentEmbeddings.vectors[index]]));
 try{
  await query("INSERT INTO users(id,email,password_hash,role) VALUES($1,$2,'fixture','USER')",[actor.id,`${actor.id}@example.test`]);
  const spaces=await query("SELECT id,visibility FROM spaces WHERE visibility IN ('SHARED','RESTRICTED')");
  const shared=spaces.rows.find(row=>row.visibility==='SHARED')?.id,restricted=spaces.rows.find(row=>row.visibility==='RESTRICTED')?.id;
  if(!shared||!restricted)throw new Error('Synthetic spaces unavailable');
   const clear=async()=>{if(activeDocuments.length)await query('DELETE FROM documents WHERE id=ANY($1::uuid[])',[[...activeDocuments]]);activeDocuments.length=0;};
   const seed=async(ids:string[])=>{
    const versionByFixture=new Map<string,string>(),fixtureByVersion=new Map<string,string>();
    for(const fixtureId of ids){
     const document=allDocuments.find(entry=>entry.id===fixtureId);if(!document)throw new Error(`Unknown fixture document ${fixtureId}`);
     const documentId=randomUUID(),versionId=randomUUID();activeDocuments.push(documentId);versionByFixture.set(document.id,versionId);fixtureByVersion.set(versionId,document.id);
     await transaction(async db=>{
      await db.query('INSERT INTO documents(id,space_id,title,kind,archived_at) VALUES($1,$2,$3,\'ARTICLE\',$4)',[documentId,document.access==='restricted'?restricted:shared,document.title,document.status==='revoked'?new Date():null]);
      await db.query('INSERT INTO document_versions(id,document_id,version_number,status,index_status,authored_by,content) VALUES($1,$2,$3,$4,\'READY\',$5,$6)',[versionId,documentId,document.version,document.current?'PUBLISHED':'ARCHIVED',actor.id,document.chunks.join('\n')]);
      if(document.current)await db.query('UPDATE documents SET current_version_id=$2 WHERE id=$1',[documentId,versionId]);
      if(document.current&&document.status==='published')for(const [ordinal,content] of document.chunks.entries()){
       const vector=vectorByChunk.get(`${document.id}:${ordinal}`);if(!vector)throw new Error(`Missing fixture embedding ${document.id}:${ordinal}`);
       await db.query('INSERT INTO knowledge_chunks(version_id,ordinal,content,embedding) VALUES($1,$2,$3,$4::vector)',[versionId,ordinal,content,JSON.stringify(vector)]);
      }
     });
    }
    return {versionByFixture,fixtureByVersion};
   };
  const rows:Row[]=[];
  for(const [index,item] of positiveCases.entries()){
    const {versionByFixture,fixtureByVersion}=await seed(item.candidateDocumentIds);
   const started=performance.now();
   const candidates=await retrieveKnowledgeCandidates(actor,item.query,5,JSON.stringify(queryEmbeddings.vectors[index]),candidateSemanticMinimum);
   const ranked=rerankKnowledgeCandidates(item.query,candidates,5,rerankPolicy),latencyMs=performance.now()-started;
   const expected=item.expectedRelevantDocumentIds.map(id=>versionByFixture.get(id)).filter((id):id is string=>Boolean(id));
   const expectedChunks=new Set(item.expectedRelevantChunks.map(value=>{const split=value.lastIndexOf(':');return `${versionByFixture.get(value.slice(0,split))}:${value.slice(split+1)}`;}));
   const rankedChunks=new Set(ranked.map(value=>`${value.versionId}:${value.ordinal}`));
   const metrics=retrievalMetrics(expected,ranked.map(value=>value.versionId));
   const hits=new Set(ranked.filter(value=>expected.includes(value.versionId)).map(value=>value.versionId)).size;
   rows.push({id:item.id,category:item.category,domain:item.domain,split:item.split,recallAt5:metrics.recall,precisionReturnedAt5:metrics.precision,precisionAt5:hits/5,mrr:metrics.mrr,chunkCoverage:expectedChunks.size?[...expectedChunks].filter(value=>rankedChunks.has(value)).length/expectedChunks.size:1,correctCurrentVersion:ranked.every(value=>!fixtureByVersion.get(value.versionId)?.endsWith('-historical')),incompatibleDocuments:ranked.filter(value=>{const fixture=fixtureByVersion.get(value.versionId);return !fixture||!item.candidateDocumentIds.includes(fixture);}).length,returned:ranked.length,latencyMs,candidates:candidates.map(value=>({documentId:fixtureByVersion.get(value.versionId)??null,versionId:value.versionId,ordinal:value.ordinal,score:value.score,semantic:value.semantic})),ranked:ranked.map(value=>({documentId:fixtureByVersion.get(value.versionId)??null,versionId:value.versionId,ordinal:value.ordinal,score:value.score}))});
    await clear();
  }
  const securityRows=[];const queryOffset=positiveCases.length;
  for(const [index,item] of securityCases.entries()){
    const {fixtureByVersion}=await seed(item.candidateDocumentIds);
   const candidates=await retrieveKnowledgeCandidates(actor,item.query,5,JSON.stringify(queryEmbeddings.vectors[queryOffset+index]),candidateSemanticMinimum);
   const ranked=rerankKnowledgeCandidates(item.query,candidates,5,rerankPolicy);
   securityRows.push({id:item.id,threat:item.threat,expectedBehavior:item.expectedBehavior,returned:ranked.map(value=>fixtureByVersion.get(value.versionId)??null),unauthorizedOrRevokedReturned:ranked.some(value=>{const fixture=fixtureByVersion.get(value.versionId);const document=allDocuments.find(entry=>entry.id===fixture);return !document||document.access==='restricted'||document.status==='revoked';})});
    await clear();
  }
  const report={schemaVersion:1,mode:'real-rag-baseline',corpusId:corpus.corpusId,corpusSchemaVersion:corpus.schemaVersion,commit,model:null,embeddingModel:process.env.OPENAI_EMBED_MODEL||'text-embedding-3-small',policy:{candidateSemanticMinimum,rerank:rerankPolicy},evaluatedSplit:split,review:{origin:'ai-technical-review',humanReview:'pending'},usage:{embeddings:{documents:documentEmbeddings.usage,queries:queryEmbeddings.usage},chat:null},pilot:aggregate(rows.filter(row=>row.split==='pilot')),holdout:aggregate(rows.filter(row=>row.split==='holdout')),scoreDistribution:scoreDistribution(rows),security:{cases:securityRows.length,unauthorizedOrRevokedReturned:securityRows.filter(row=>row.unauthorizedOrRevokedReturned).length,rows:securityRows},rows};
  writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');return report;
 }finally{
  if(activeDocuments.length)await query('DELETE FROM documents WHERE id=ANY($1::uuid[])',[[...activeDocuments]]);
  await query('DELETE FROM users WHERE id=$1',[actor.id]).catch(()=>undefined);
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [corpusPath,outputPath,commit]=process.argv.slice(2);if(!corpusPath||!outputPath||!/^[a-f0-9]{40}$/.test(commit??''))throw new Error('Usage: rag-corpus-baseline <corpus> <output> <commit>');
 const number=(name:string,fallback:number)=>process.env[name]===undefined?fallback:Number(process.env[name]);
 const options:BaselineOptions={split:(process.env.RAG_SPLIT??'all') as BaselineOptions['split'],candidateSemanticMinimum:number('RAG_CANDIDATE_SEMANTIC_MINIMUM',DEFAULT_CANDIDATE_SEMANTIC_MINIMUM),includeSecurity:process.env.RAG_INCLUDE_SECURITY!=='0',rerankPolicy:{semanticMinimum:number('RAG_RERANK_SEMANTIC_MINIMUM',DEFAULT_RERANK_POLICY.semanticMinimum),diversityPenalty:number('RAG_RERANK_DIVERSITY_PENALTY',DEFAULT_RERANK_POLICY.diversityPenalty),lexicalMinimum:number('RAG_RERANK_LEXICAL_MINIMUM',DEFAULT_RERANK_POLICY.lexicalMinimum)}};
 runRagCorpusBaseline(corpusPath,outputPath,commit!,options).then(report=>{console.log(JSON.stringify({policy:report.policy,evaluatedSplit:report.evaluatedSplit,pilot:report.pilot,holdout:report.holdout,security:report.security.cases,usage:report.usage},null,2));}).finally(()=>pool.end());
}
