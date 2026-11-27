import {embedText,client} from './llm.js';
import {retrieveKnowledgeCandidates,safeRetrievedSources} from './retrieval.js';
import type {Actor} from './security.js';
import type {Case} from './rag-calibration.js';
/** Test-only capture. Caller must provide an isolated synthetic corpus and its version allowlist. */
export async function captureCalibrationCase(actor:Actor,input:Omit<Case,'candidates'>,syntheticVersions:ReadonlySet<string>,semantic=false):Promise<Case>{
 if(process.env.NODE_ENV!=='test'||!process.env.TEST_DATABASE_URL||process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw new Error('Isolated test database required');
 if(!input.expected.length||input.expected.some(id=>!syntheticVersions.has(id)))throw new Error('Expected versions must be synthetic fixtures');
 // Do not transmit evaluation queries to external services here. The lexical capture is explicitly offline.
 if(semantic&&(!client||process.env.RUN_REAL_EPISODES!=='1'))throw new Error('Explicit real evaluation authorization required');
 const embedding=semantic?await embedText(input.query):null;
 if(semantic&&!embedding)throw new Error('Embedding unavailable');
 const candidates=await retrieveKnowledgeCandidates(actor,input.query,5,embedding?JSON.stringify(embedding):null);
 if(candidates.some(c=>!syntheticVersions.has(c.versionId)))throw new Error('Non-fixture candidate encountered; capture aborted');
 return {...input,candidates:safeRetrievedSources(candidates,candidates.length)};
}
