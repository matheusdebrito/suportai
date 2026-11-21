export type WritableSpace={id:string;name:string};
type Message={role:'user'|'assistant';content:string};

function normalized(value:string):string{
 return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
}
function namedSpaces(text:string,spaces:WritableSpace[]):WritableSpace[]{
 const input=normalized(text);
 return spaces.filter(space=>{
  const name=normalized(space.name.trim());
  if(!name)return false;
  const start=0;
  let offset=start;
  while((offset=input.indexOf(name,offset))!==-1){
   const preceding=offset===0?'':input[offset-1];
   const following=input[offset+name.length]??'';
   if(!/[\p{L}\p{N}]/u.test(preceding) && !/[\p{L}\p{N}]/u.test(following))
    return true;
   offset+=name.length;
  }
  return false;
 });
}

/**
 * Defensive backend check for *new* knowledge proposals.
 * Do not let a model silently select one of several writable destinations.
 * Only the user's own words are usable as targeting evidence.
 */
export function explicitlyTargetedSpace(
 currentMessage:string,
 history:Message[],
 spaces:WritableSpace[]
):WritableSpace|null{
 if(spaces.length===0)return null;
 if(spaces.length===1)return spaces[0];
 const current=namedSpaces(currentMessage,spaces);
 if(current.length===1)return current[0];
 if(current.length>1)return null;
 // Allow a precise reference to a recently named space only when the
 // current message explicitly refers back to it.
 if(!/\b(?:nesse|neste|naquele|naquela)\s+(?:espa[cç]o|base)\b/i.test(currentMessage))
  return null;
 const previous=history.filter(m=>m.role==='user').slice(-3).reverse();
 for(const m of previous){
  const names=namedSpaces(m.content,spaces);
  if(names.length===1)return names[0];
  if(names.length>1)return null;
 }
 return null;
}
