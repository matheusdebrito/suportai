import type {Source} from './retrieval.js';

/**
 * Syntactic safeguard, not an entailment checker. Source metadata is not
 * sufficient: operational addresses must appear in the cited excerpt.
 */
export function unsupportedNetworkLiterals(answer:string,sources:Pick<Source,'content'>[]):string[]{
 const values=[
   ...answer.matchAll(/\bhttps?:\/\/[^\s<>"']+/gi),
   ...answer.matchAll(/(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])/g)
 ].map(m=>m[0].replace(/[),.;!?]+$/,''));
 const excerpts=sources.map(s=>s.content.toLowerCase());
 return [...new Set(values)].filter(value=>!excerpts.some(content=>content.includes(value.toLowerCase())));
}
