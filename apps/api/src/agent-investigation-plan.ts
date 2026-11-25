export type ReadOutcome='evidence'|'unchanged'|'empty'|'timeout'|'unavailable'|'inaccessible'|'duplicate';
type ReadAction='document'|'versions'|'spaces';
type Gap='evidence'|'context'|'conflict'|'dependency'|'access';
type Strategy='explore'|'reformulate'|'inspect'|'recover'|'conclude';

export type InvestigationMetrics={
 readAttempts:number;readsWithNewEvidence:number;evidenceCount:number;emptyReads:number;duplicateReads:number;
 readTimeouts:number;unavailableReads:number;inaccessibleReads:number;
 stalledSteps:number;clarificationRequests:number;conflicts:number;blockedWriteRetries:number;
};

const guidance:Record<Strategy,string>={
 explore:'Busque somente o que ajuda a responder ao pedido ou pergunte pelo único detalhe indispensável.',
 reformulate:'A última leitura não acrescentou evidência. Use termos realmente diferentes ou abra outra fonte. Peça contexto somente se indispensável.',
 inspect:'Se as fontes atuais bastarem, conclua com elas. Abra um documento ou compare versões somente quando puder resolver uma lacuna específica.',
 recover:'Houve falha de leitura. Se houver alternativa útil, tente outra leitura autorizada ou reformule a busca. Não repita a mesma chamada nem tente gravar para compensar a falha.',
 conclude:'Encerre com as evidências autorizadas já obtidas. Explicite lacunas ou divergências e deixe de fora qualquer procedimento sem apoio.'
};

/** Turn-local operational state. Only the counters are returned in telemetry. */
export class InvestigationPlan{
 private readonly gaps=new Set<Gap>();
 private readonly reads=new Set<string>();
 private counters:InvestigationMetrics={
  readAttempts:0,readsWithNewEvidence:0,evidenceCount:0,emptyReads:0,duplicateReads:0,
  readTimeouts:0,unavailableReads:0,inaccessibleReads:0,stalledSteps:0,
  clarificationRequests:0,conflicts:0,blockedWriteRetries:0
 };
 private madeProgress=false;
 private consecutiveStalls=0;
 private writeAttempted=false;
 private strategy:Strategy='explore';

 constructor(readonly objective:string,readonly needsEvidence:boolean,readonly hypotheses:readonly string[]=[]){
  if(needsEvidence)this.gaps.add('evidence');
 }

 beginTools():void{this.madeProgress=false;}
 beginRead(action:ReadAction,key:string):boolean{
  const identity=`${action}:${key}`;
  if(this.reads.has(identity)){
   this.recordRead('duplicate');
   return false;
  }
  this.reads.add(identity);
  return true;
 }

 recordRead(outcome:ReadOutcome,added=0,novelAttempt=false):void{
  if(outcome!=='duplicate')this.counters.readAttempts++;
  switch(outcome){
   case 'evidence':
    this.counters.readsWithNewEvidence++;
    this.counters.evidenceCount+=added;
    this.gaps.delete('evidence');
    this.madeProgress=true;
    this.strategy='inspect';
    break;
   case 'empty':
    this.counters.emptyReads++;
    this.madeProgress ||= novelAttempt;
    this.strategy='reformulate';
    break;
   case 'duplicate':
    this.counters.duplicateReads++;
    this.strategy='reformulate';
    break;
   case 'timeout':
   case 'unavailable':
    if(outcome==='timeout')this.counters.readTimeouts++;
    else this.counters.unavailableReads++;
    this.gaps.add('dependency');
    this.madeProgress ||= novelAttempt;
    this.strategy='recover';
    break;
   case 'inaccessible':
    this.counters.inaccessibleReads++;
    this.gaps.add('access');
    this.strategy='recover';
    break;
   case 'unchanged': this.strategy='reformulate';break;
  }
 }

 requestClarification():void{this.counters.clarificationRequests++;this.gaps.add('context');}
 recordConflict():void{this.counters.conflicts++;this.gaps.add('conflict');}
 beginWrite():boolean{
  if(this.writeAttempted){this.counters.blockedWriteRetries++;return false;}
  this.writeAttempted=true;
  return true;
 }
 recordProgress():void{this.madeProgress=true;}
 readIssue():'timeout'|'unavailable'|'inaccessible'|null{
  if(this.gaps.has('dependency'))return this.counters.unavailableReads ? 'unavailable' : 'timeout';
  return this.gaps.has('access') ? 'inaccessible' : null;
 }
 finishTools(forceFinal:boolean):boolean{
  this.consecutiveStalls=this.madeProgress ? 0 : this.consecutiveStalls+1;
  if(!this.madeProgress)this.counters.stalledSteps++;
  if(forceFinal||this.consecutiveStalls>=2)this.strategy='conclude';
  return this.strategy==='conclude';
 }
 instruction():string{
  const hypotheses=this.hypotheses.length?' As hipóteses relatadas precisam de confirmação.':'';
  const missing=this.strategy==='conclude'&&this.gaps.has('evidence')?' Ainda não há evidência para confirmar um procedimento.':'';
  return `Próxima decisão da investigação: ${guidance[this.strategy]}${missing}${hypotheses}`;
 }
 metrics():InvestigationMetrics{return {...this.counters};}
}
