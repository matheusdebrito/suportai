/** Evaluation-only expectations derived from the frozen fixture documents.
 * Never import this file into routing, retrieval or response generation.
 * Keep these additional assertions separate from historical check totals. */
type Expectation={required?:string[][];forbidden?:string[];completedInstruction?:string;mode?:'guided'|'complete'};
export const SUPPLEMENTAL_QUALITY_CONTRACT='episode-material-regression-v1';
const expectations:Record<string,Expectation>={
 'phone:1':{mode:'guided'},
 'phone:2':{mode:'guided'},
 'phone:5':{required:[['Status'],['IP'],['navegador'],['senha'],['Account Active'],['YES']]},
 'printer-negative-progress:1':{mode:'guided'},
 'printer-negative-progress:2':{mode:'guided'},
 'printer-negative-progress:3':{forbidden:['sensor'],completedInstruction:'Feche a tampa.',mode:'guided'},
 'printer-negative-progress:4':{required:[['laboratório'],['alinha'],['tampa'],['Feed'],['avanç']],forbidden:['sensor']},
 'ris-erp-switch-resume:2':{required:[['paciente'],['engrenagem'],['cadastro'],['convênio']]},
 'ris-erp-switch-resume:4':{required:[['ERP'],['Estoque'],['inventário']]},
 'ris-erp-switch-resume:6':{required:[['paciente'],['engrenagem'],['cadastro'],['convênio']]},
 'focused-scanner-and-mode:4':{required:[['aplicativo'],['Digitalizar'],['300 DPI'],['PDF']]},
 'informal-intent-and-context-switch:3':{required:[['Nimbo'],['Identificação de visitantes'],['Novo crachá']]}
};
const normalize=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/\[\d+\]/g,'').replace(/\*\*/g,'').replace(/\s+/g,' ').trim();
const segmenter=new Intl.Segmenter('pt-BR',{granularity:'sentence'});
const unit=(s:string)=>normalize(s).replace(/^(?:\d+[.)]|[-*+])\s+/,'').replace(/[.!?]+$/,'').trim();
export function supplementalEpisodeChecks(episodeId:string,turn:number,answer:string,mode?:string):string[]{
 const expected=expectations[episodeId+':'+turn];
 if(!expected)return [];
 const failures:string[]=[],text=normalize(answer);
 if(expected.mode&&expected.mode!==mode)failures.push('unexpected_support_preference');
 for(const [i,alternatives] of (expected.required??[]).entries())
  if(!alternatives.some(marker=>text.includes(normalize(marker))))failures.push('missing_documented_marker_'+(i+1));
 for(const [i,marker] of (expected.forbidden??[]).entries())
  if(text.includes(normalize(marker)))failures.push('undocumented_concept_'+(i+1));
 if(expected.completedInstruction&&answer.split('\n').some(line=>[...segmenter.segment(line)].some(s=>unit(s.segment)===unit(expected.completedInstruction!))))
  failures.push('repeated_explicitly_completed_instruction');
 return failures;
}
