import type OpenAI from 'openai';
import {AgentBudget} from './agent-budget.js';
import {reviewEntailment,type EntailmentResult} from './grounding-entailment.js';

/** Independent synthetic challenge, separate from the historical episodes.
 * Labels are authored before execution, never inferred from the reviewer. */
type EntailmentCase={id:string;statement:string;quotes:string[];shouldAccept:boolean};
export const entailmentCases:readonly EntailmentCase[]=[
 {id:'faithful-paraphrase',statement:'Verifique se a luz indicadora está acesa.',quotes:['Confira se a luz de estado está acesa.'],shouldAccept:true},
 {id:'documented-cause',statement:'A indicação intermitente sinaliza falta de alimentação.',quotes:['A luz intermitente indica ausência de alimentação.'],shouldAccept:true},
 {id:'preserved-scope',statement:'Somente na bancada Laranja, consulte a tela de inspeção.',quotes:['Para uso exclusivo na bancada Laranja: consulte a tela de inspeção.'],shouldAccept:true},
 {id:'preserved-order',statement:'Confira a proteção antes de iniciar a inspeção.',quotes:['Inicie a inspeção somente depois de conferir a proteção.'],shouldAccept:true},
 {id:'preserved-field',statement:'O formato do relatório é CSV.',quotes:['Formato do relatório: CSV.'],shouldAccept:true},
 {id:'invented-cause',statement:'A luz apagada pode indicar defeito no motor.',quotes:['Confira se a luz de estado está acesa.'],shouldAccept:false},
 {id:'invented-priority',statement:'Use primeiro a opção Alfa, depois a opção Beta se a Alfa falhar.',quotes:['As opções disponíveis são Alfa ou Beta.'],shouldAccept:false},
 {id:'removed-condition',statement:'Inicie a inspeção agora.',quotes:['Inicie a inspeção somente depois de conferir a proteção.'],shouldAccept:false},
 {id:'wrong-scope',statement:'A tela de inspeção é aplicável à bancada Roxa.',quotes:['Para uso exclusivo na bancada Laranja: consulte a tela de inspeção.'],shouldAccept:false},
 {id:'invented-result',statement:'Abrir a tela garante a conclusão da inspeção.',quotes:['Abra a tela de inspeção.'],shouldAccept:false}
];
export type EntailmentBenchmarkRow={id:string;shouldAccept:boolean;status:EntailmentResult['status']};
export function measureEntailmentBenchmark(rows:readonly EntailmentBenchmarkRow[]){
 return {cases:rows.length,
  falseAcceptances:rows.filter(r=>!r.shouldAccept&&r.status==='supported').length,
  falseRejections:rows.filter(r=>r.shouldAccept&&r.status==='unsupported').length,
  unavailable:rows.filter(r=>r.status==='unavailable').length};
}
export async function benchmarkEntailment(provider:OpenAI){
 const rows:EntailmentBenchmarkRow[]=[];
 for(const item of entailmentCases){
  const result=await reviewEntailment(provider,new AgentBudget(),[{unit:1,statement:item.statement,quotes:item.quotes}]);
  rows.push({id:item.id,shouldAccept:item.shouldAccept,status:result.status});
 }
 return {caseSet:'entailment-challenge-v1',expectedCaseCount:entailmentCases.length,complete:rows.length===entailmentCases.length,metrics:measureEntailmentBenchmark(rows),rows};
}
