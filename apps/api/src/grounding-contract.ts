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
