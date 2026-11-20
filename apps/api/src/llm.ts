import OpenAI from 'openai';
import {externalAIApproved} from './llm-policy.js';

// Knowledge excerpts and user questions can contain internal information.
// Configuring a key alone must not authorize external data transfer.
const apiKey=process.env.OPENAI_API_KEY;
export const client=externalAIApproved(apiKey,process.env.ALLOW_EXTERNAL_AI_DATA_PROCESSING)
 ? new OpenAI({apiKey,timeout:20_000,maxRetries:1}) : null;

export async function embedText(text:string):Promise<number[]|null> {
 if(!client) return null;
 const r=await client.embeddings.create({model:process.env.OPENAI_EMBED_MODEL||'text-embedding-3-small',input:text,dimensions:1536});
 return r.data[0].embedding;
}
export function isModelConfigured(){return Boolean(client);}
