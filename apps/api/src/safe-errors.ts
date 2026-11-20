/**
 * Never persist exception messages from dependencies, SQL, external models
 * or PDF parsers. Those messages may include document excerpts or credentials.
 */
const expectedWorkerFailures=new Set([
 'Versão inexistente',
 'Possível credencial detectada; revisão necessária',
 'Documento vazio',
 'Documento muito extenso; divida-o em arquivos menores',
 'Quantidade de trechos excede o limite; processamento interrompido',
 'PDF excede o limite de 8 MB',
 'PDF inválido',
 'Não foi possível iniciar o leitor de PDFs',
 'Tempo limite para leitura do PDF excedido',
 'PDF excede o limite de texto extraído',
 'PDF sem texto extraível; necessário texto digital',
 'PDF excede o limite de 200 páginas',
 'PDF excede os limites de processamento',
 'PDF inválido ou não foi possível extrair o texto'
]);
export function safeWorkerFailure(error:unknown):string{
 const message=error instanceof Error?error.message:'';
 return expectedWorkerFailures.has(message)?message:'Falha interna de processamento; contate a equipe de TI';
}
export function safeErrorType(error:unknown):string{
 if(error instanceof SyntaxError)return 'SyntaxError';
 if(error instanceof TypeError)return 'TypeError';
 if(error instanceof RangeError)return 'RangeError';
 return 'Error';
}
