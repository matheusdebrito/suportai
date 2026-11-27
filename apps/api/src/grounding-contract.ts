/** Structured Outputs transport contract; semantic authorization is still server-side. */
export const GROUNDING_SCHEMA_VERSION='grounding_review_v1';
const verdicts=['supported','unsupported','uncertain','conflict'] as const;
const kinds=['current','historical','comparison','question','nonclaim','unsupported'] as const;
export type GroundingClaim={unit:number;kind:typeof kinds[number];refs:{evidence:number;quote:string}[]};
export const reviewIssues=['none','unsupported_content','missing_coverage','wrong_scope','unresolved_conflict','unsafe_content','other'] as const;
export type GroundingReviewIssue=typeof reviewIssues[number];
export type GroundingReview={verdict:typeof verdicts[number];claims:GroundingClaim[];coverage?:'complete'|'partial'|'not_applicable';issue?:GroundingReviewIssue};
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
export const COMPLETE_GROUNDING_SCHEMA_VERSION='grounding_complete_review_v4';
const coverageValues=['complete','partial','not_applicable'] as const;
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
export function indexedGroundingResponseFormat(count:number,requireCoverage=false){
 if(!Number.isInteger(count)||count<1||count>20)throw new Error('Invalid grounding unit count');
 const keys=unitKeys(count);
 return {type:'json_schema' as const,json_schema:{name:requireCoverage?COMPLETE_GROUNDING_SCHEMA_VERSION:INDEXED_GROUNDING_SCHEMA_VERSION,strict:true,schema:{
  type:'object',additionalProperties:false,required:['verdict','claims',...(requireCoverage?['coverage','issue']:[])],
  properties:{verdict:{type:'string',enum:[...verdicts]},...(requireCoverage?{coverage:{type:'string',enum:[...coverageValues]},issue:{type:'string',enum:[...reviewIssues]}}:{}),claims:{anyOf:[
   {type:'object',additionalProperties:false,required:keys,
    properties:Object.fromEntries(keys.map(key=>[key,{$ref:'#/$defs/claim'}]))},
   {type:'null'}
  ]}},
  $defs:{claim:{type:'object',additionalProperties:false,required:['kind','refs'],
   properties:{kind:{type:'string',enum:[...kinds]},refs:{type:'array',items:{type:'string'}}}}}
 }}};
}
export function parseIndexedGroundingReview(value:unknown,count:number,spans:readonly IndexedEvidenceSpan[],requireCoverage=false):GroundingReview|null{
 if(!Number.isInteger(count)||count<1||count>20||!exact(value,['verdict','claims',...(requireCoverage?['coverage','issue']:[])])||
    !verdicts.includes(value.verdict as GroundingReview['verdict']))return null;
 const verdict=value.verdict as GroundingReview['verdict'];
 const coverage=requireCoverage?value.coverage as GroundingReview['coverage']:undefined;
 const issue=requireCoverage?value.issue as GroundingReviewIssue:undefined;
 if(requireCoverage&&(!coverageValues.includes(coverage as typeof coverageValues[number])||!reviewIssues.includes(issue as GroundingReviewIssue)))return null;
 if(verdict!=='supported')return value.claims===null&&(!requireCoverage||coverage==='not_applicable'&&issue!=='none')?{verdict,claims:[],...(coverage?{coverage}:{}),...(issue?{issue}:{})}:null;
 if(requireCoverage&&coverage==='complete'&&issue!=='none')return null;
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
 return {verdict,claims,...(coverage?{coverage}:{}),...(issue?{issue}:{})};
}

/** Exact-document review has no generated quotations or arbitrary claim IDs.
 * The backend proves identity independently; the model must still judge
 * applicability, safety and coverage of the entire requested procedure. */
export const SOURCE_ALIGNED_REVIEW_FORMAT={type:'json_schema' as const,json_schema:{
 name:'source_aligned_review_v1',strict:true,schema:{
  type:'object',additionalProperties:false,required:['verdict','issue'],
  properties:{verdict:{type:'string',enum:[...verdicts]},issue:{type:'string',enum:[...reviewIssues]}}
 }
}};
export function parseSourceAlignedReview(value:unknown):{verdict:GroundingReview['verdict'];issue:GroundingReviewIssue}|null{
 if(!exact(value,['verdict','issue'])||!verdicts.includes(value.verdict as GroundingReview['verdict'])||
    !reviewIssues.includes(value.issue as GroundingReviewIssue)||
    (value.verdict==='supported')!==(value.issue==='none'))return null;
 return {verdict:value.verdict as GroundingReview['verdict'],issue:value.issue as GroundingReviewIssue};
}
