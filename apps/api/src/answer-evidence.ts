import type {Source} from './retrieval.js';

/**
 * Only an exact, syntactically recognized network literal counts as support.
 * Searching for substrings can mistake 192.0.2.5 for 192.0.2.53, or
 * https://site.test/path for https://site.test/path/unsafe.
 * This is intentionally NOT a semantic entailment checker.
 */
const NETWORK_LITERAL=/\bhttps?:\/\/[^\s<>"']+|(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?!\w|\.\d)/gi;
function networkLiterals(text:string):string[]{
 const found:string[]=[];
 for(const match of text.matchAll(NETWORK_LITERAL)){
   const normalized=match[0].replace(/[),;!?]+$/,'').replace(/\.$/,'').toLowerCase();
   if(normalized) found.push(normalized);
 }
 return found;
}
export function unsupportedNetworkLiterals(answer:string,sources:Pick<Source,'content'>[]):string[]{
 const supported=new Set(sources.flatMap(s=>networkLiterals(s.content)));
 return [...new Set(networkLiterals(answer))].filter(value=>!supported.has(value));
}

export function unsupportedNumbers(statement:string,quotes:string[]):boolean{
 const numeric=(text:string)=>[...text.replace(/^\s*\d+[.)]\s+/,'').matchAll(/(?<![\p{L}\d])[-+]?\d+(?:[.,]\d+)*(?:\s*%)?(?![\p{L}\d]|[.,]\d)/gu)]
   .map(match=>match[0].replace(/\s+/g,''));
 const supported=new Set(quotes.flatMap(numeric));
 return numeric(statement).some(value=>!supported.has(value));
}


/** Recognized single-line configuration assignments must retain the exact value
 * from a cited passage, including case-sensitive passwords and hostnames. */
const configurationField=/^\s*(?:(?:[-*+]|\d+[.)])\s+)?(?:\*\*)?(senha(?: operacional)?|password|sip server|account active|sip user id|authenticate password|authenticate id|proxy server|servidor sip)(?:\*\*)?\s*[:=]\s*(?:\*\*)?(.+)$/i;
export function unsupportedConfigurationField(statement:string,quotes:string[]):boolean{
 const field=configurationField.exec(statement);
 if(!field)return false;
 const label=field[1].toLowerCase();
 const value=field[2].trim().replace(/\*\*$/,'').replace(/^\x60|\x60$/g,'').replace(/\.$/,'');
 return !quotes.some(quote=>quote.split(/\r?\n/).some(line=>{
   const candidate=configurationField.exec(line);
   return candidate&&candidate[1].toLowerCase()===label&&candidate[2].trim().replace(/\*\*$/,'').replace(/^\x60|\x60$/g,'').replace(/\.$/,'')===value;
 }));
}
