// A deliberately explicit article convention. Do not infer arbitrary strings are secrets.
// Keep support for the common "Fazer login (user - password)" procedure format.
const operationalLine=/^\s*(?:[-*]\s+)?(?:\*\*)?(?:credencial operacional|senha operacional|senha padr[aã]o)(?:\*\*)?\s*:\s*\S/i;
const loginLine=/^\s*(?:[-*]\s+)?(?:fazer|faça)\s+login\s*\([^\r\n]+?\s+[-–]\s+[^\r\n]+\)\s*\.?\s*$/i;
const forbidden=/-----BEGIN [^\r\n]*PRIVATE KEY-----|(?:api[_ -]?key|secret|token|authorization)\s*[:=]\s*\S|(?:ghp|gho|ghu|ghs|ghr)_[a-z0-9]{30,}|github_pat_[a-z0-9_]{25,}|sk-[a-z0-9_-]{20,}|AKIA[0-9A-Z]{16}/i;
const isOperational=(line:string)=>operationalLine.test(line)||loginLine.test(line);
export function operationalLines(text:string):string[]{return text.split(/\r?\n/).filter(isOperational);}
export function containsOperationalText(text:string):boolean{return operationalLines(text).length>0;}
export function forbiddenOperationalText(text:string):boolean{return operationalLines(text).some(line=>forbidden.test(line));}
export function maskOperationalText(text:string):string{
 return text.split(/(\r?\n)/).map(line=>isOperational(line)
  ? (loginLine.test(line)?'Fazer login com a credencial do procedimento publicado.':'Consultar a credencial operacional no procedimento publicado.')
  :line).join('');
}
