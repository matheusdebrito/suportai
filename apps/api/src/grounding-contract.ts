/** Structured Outputs transport contract; semantic authorization is still server-side. */
export const GROUNDING_SCHEMA_VERSION='grounding_review_v1';
const verdicts=['supported','unsupported','uncertain','conflict'] as const;
const kinds=['current','historical','comparison','question','nonclaim','unsupported'] as const;
export type GroundingClaim={unit:number;kind:typeof kinds[number];refs:{evidence:number;quote:string}[]};
export type GroundingReview={verdict:typeof verdicts[number];claims:GroundingClaim[]};
export const GROUNDING_RESPONSE_FORMAT={
 type:'json_schema' as const,
 json_schema:{name:GROUNDING_SCHEMA_VERSION,strict:true,schema:{
  type:'object',additionalProperties:false,required:['verdict','claims'],
  properties:{verdict:{type:'string',enum:[...verdicts]},claims:{type:'array',items:{
   type:'object',additionalProperties:false,required:['unit','kind','refs'],
   properties:{unit:{type:'integer'},kind:{type:'string',enum:[...kinds]},refs:{type:'array',items:{
    type:'object',additionalProperties:false,required:['evidence','quote'],
    properties:{evidence:{type:'integer'},quote:{type:'string'}}
   }}}
  }}}
 }}
};
function exact(value:unknown,keys:string[]):value is Record<string,unknown>{
 return typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.prototype.hasOwnProperty.call(value,key));
}
/** Provider schema constraints are not trusted. Check exact keys, enums and bounds locally. */
export function parseGroundingReview(value:unknown):GroundingReview|null{
 if(!exact(value,['verdict','claims'])||!verdicts.includes(value.verdict as GroundingReview['verdict'])||!Array.isArray(value.claims)||value.claims.length>20)return null;
 if(value.verdict!=='supported'&&value.claims.length!==0)return null;
 for(const claim of value.claims){
  if(!exact(claim,['unit','kind','refs'])||!Number.isSafeInteger(claim.unit)||!kinds.includes(claim.kind as GroundingClaim['kind'])||!Array.isArray(claim.refs)||claim.refs.length>3)return null;
  for(const ref of claim.refs){
   if(!exact(ref,['evidence','quote'])||!Number.isSafeInteger(ref.evidence)||typeof ref.quote!=='string'||ref.quote.length>240||ref.quote.trim().length<4)return null;
  }
 }
 return value as GroundingReview;
}
/** Do not include provider messages, prompt contents or response bodies in telemetry. */
export function incompatibleStructuredOutput(error:unknown):boolean{
 if(typeof error!=='object'||error===null)return false;
 const e=error as {status?:unknown;param?:unknown;code?:unknown;message?:unknown};
 return (e.status===400||e.status===422)&&(
  (typeof e.param==='string'&&e.param.startsWith('response_format'))||
  (typeof e.code==='string'&&['unsupported_response_format','invalid_json_schema','unsupported_value'].includes(e.code))||
  (typeof e.message==='string'&&/response_format|json_schema|structured outputs/i.test(e.message))
 );
}

/** Structural recovery contract: every unit has a required server-generated
 * key. References select existing evidence spans; the model never reproduces
 * a quote. The same local grounding checks consume the resolved claims. */
export const INDEXED_GROUNDING_SCHEMA_VERSION='grounding_indexed_review_v2';
export type IndexedEvidenceSpan={id:string;evidence:number;quote:string};
export function indexEvidenceSpans(passages:readonly {text:string}[]):IndexedEvidenceSpan[]{
 const spans:IndexedEvidenceSpan[]=[];
 for(const [index,passage] of passages.entries()){
  let ordinal=0;
  for(const line of passage.text.split(/\r?\n/)){
   // Keep scope, fields and numbered steps together where possible. For
   // long lines use bounded overlapping exact substrings, without paraphrase.
   for(let start=0;start<line.length;){
    let end=Math.min(line.length,start+220);
    if(end<line.length){
     const space=line.lastIndexOf(' ',end);
     if(space>start+140)end=space;
    }
    const quote=line.slice(start,end).trim();
    if(quote.length>=4)spans.push({id:'e'+(index+1)+'s'+(++ordinal),evidence:index+1,quote});
    if(end===line.length)break;
    start=Math.max(start+1,end-32);
   }
  }
 }
 return spans;
}
const unitKeys=(count:number)=>Array.from({length:count},(_,i)=>'u'+(i+1));
export function indexedGroundingResponseFormat(count:number){
 if(!Number.isInteger(count)||count<1||count>20)throw new Error('Invalid grounding unit count');
 const keys=unitKeys(count);
 return {type:'json_schema' as const,json_schema:{name:INDEXED_GROUNDING_SCHEMA_VERSION,strict:true,schema:{
  type:'object',additionalProperties:false,required:['verdict','claims'],
  properties:{verdict:{type:'string',enum:[...verdicts]},claims:{anyOf:[
   {type:'object',additionalProperties:false,required:keys,
    properties:Object.fromEntries(keys.map(key=>[key,{$ref:'#/$defs/claim'}]))},
   {type:'null'}
  ]}},
  $defs:{claim:{type:'object',additionalProperties:false,required:['kind','refs'],
   properties:{kind:{type:'string',enum:[...kinds]},refs:{type:'array',items:{type:'string'}}}}}
 }}};
}
export function parseIndexedGroundingReview(value:unknown,count:number,spans:readonly IndexedEvidenceSpan[]):GroundingReview|null{
 if(!Number.isInteger(count)||count<1||count>20||!exact(value,['verdict','claims'])||
    !verdicts.includes(value.verdict as GroundingReview['verdict']))return null;
 const verdict=value.verdict as GroundingReview['verdict'];
 if(verdict!=='supported')return value.claims===null?{verdict,claims:[]}:null;
 const keys=unitKeys(count);
 if(!exact(value.claims,keys))return null;
 const byId=new Map(spans.map(span=>[span.id,span]));
 const claims:GroundingClaim[]=[];
 for(const [index,key] of keys.entries()){
  const claim=value.claims[key];
  if(!exact(claim,['kind','refs'])||!kinds.includes(claim.kind as GroundingClaim['kind'])||
     !Array.isArray(claim.refs)||claim.refs.length>3||new Set(claim.refs).size!==claim.refs.length)return null;
  const refs:GroundingClaim['refs']=[];
  for(const id of claim.refs){
   if(typeof id!=='string')return null;
   const span=byId.get(id);if(!span)return null;
   refs.push({evidence:span.evidence,quote:span.quote});
  }
  claims.push({unit:index+1,kind:claim.kind as GroundingClaim['kind'],refs});
 }
 return {verdict,claims};
}
