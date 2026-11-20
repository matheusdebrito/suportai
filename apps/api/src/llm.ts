import OpenAI from 'openai';
const apiKey=process.env.OPENAI_API_KEY;
export const client=apiKey?new OpenAI({apiKey,timeout:20_000,maxRetries:1}):null;
export async function embedText(text:string):Promise<number[]|null> {
 if(!client) return null;
 const r=await client.embeddings.create({model:process.env.OPENAI_EMBED_MODEL||'text-embedding-3-small',input:text,dimensions:1536});
 return r.data[0].embedding;
}
export function isModelConfigured(){return Boolean(client);}
