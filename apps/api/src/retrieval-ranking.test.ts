import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {pool,query,transaction} from './db.js';
import {retrieveKnowledgeCandidates,rerankKnowledgeCandidates,searchKnowledge,type Source} from './retrieval.js';
import type {Actor} from './security.js';

const vector=(first:number,second:number)=>JSON.stringify([first,second,...Array<number>(1534).fill(0)]);

if(!process.env.TEST_DATABASE_URL){
 test('retrieval ranking requires isolated PostgreSQL',{skip:'No TEST_DATABASE_URL'},()=>{});
}else{
 if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw new Error('Ranking tests require an isolated PostgreSQL database');
 after(()=>pool.end());

 test('authorized reranking improves top-3 on a fictional lexical corpus and retains strong vector hits',async()=>{
  const actor:Actor={id:randomUUID(),role:'USER',auth_revision:0,must_change_password:false};
  const seed=await transaction(async client=>{
   await client.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'fixture')",[actor.id,`${actor.id}@example.test`]);
   const spaces=await client.query<{id:string;visibility:string}>("SELECT id,visibility FROM spaces WHERE name IN ('Conhecimento geral','TI - restrito')");
   const shared=spaces.rows.find(space=>space.visibility==='SHARED')!.id;
   const restricted=spaces.rows.find(space=>space.visibility==='RESTRICTED')!.id;
   const fixtures=[];
   for(const [term,action,equipment] of [['Brumaflux','calibrar','sensor'],['Orbiscentro','emparelhar','visor'],['Lunametria','sincronizar','relógio']]){
    const question=`${term} ${action} ${equipment}`;
    const target=await insertDocument(client,actor.id,shared,'Rotina de bancada',[
     `Para ${action} o ${equipment} ${term}, confira a leitura com o gabarito.`
    ]);
    const decoy=await insertDocument(client,actor.id,shared,question,Array<string>(4).fill('Informativo geral de manutenção.'));
    const hidden=await insertDocument(client,actor.id,restricted,question,[`${question} com medidor restrito.`]);
    fixtures.push({question,target,decoy,hidden});
   }
   const strong=await insertDocument(client,actor.id,shared,'Ajuste do equipamento',['Meça a vibração e registre o resultado.'],vector(1,0));
   const weak=await insertDocument(client,actor.id,shared,'Inspeção de bancada',['Observe o painel durante a inspeção.'],vector(0.5,Math.sqrt(0.75)));
   return {fixtures,strong,weak,restricted};
  });
  try{
   const baseline:number[]=[];
   const ranked:number[]=[];
   for(const item of seed.fixtures){
    const candidates=await retrieveKnowledgeCandidates(actor,item.question,3,null);
    assert.ok(candidates.some(source=>source.documentId===item.target));
    assert.ok(candidates.every(source=>source.documentId!==item.hidden));
    const reranked=rerankKnowledgeCandidates(item.question,candidates,3);
    const live=await searchKnowledge(actor,item.question,3);
    assert.deepEqual(live,reranked);
    assert.equal(reranked[0]?.documentId,item.target);
    assert.ok(reranked.filter(source=>source.documentId===item.decoy).length<=1);
    baseline.push(rank(candidates.slice(0,3),item.target));
    ranked.push(rank(reranked,item.target));
   }
   const semantic=await retrieveKnowledgeCandidates(actor,'opalaquim',3,vector(1,0));
   assert.ok(semantic.some(source=>source.documentId===seed.weak));
   assert.deepEqual(rerankKnowledgeCandidates('opalaquim',semantic,3).map(source=>source.documentId),[seed.strong]);
   assert.deepEqual(await searchKnowledge(actor,'Preciso de ajuda com o procedimento da empresa',3),[]);
   const measures=(ranks:number[])=>({recallAt3:ranks.filter(Boolean).length/ranks.length,
    mrrAt3:ranks.reduce((sum,value)=>sum+(value?1/value:0),0)/ranks.length});
   assert.ok(measures(ranked).recallAt3>measures(baseline).recallAt3);
   assert.ok(measures(ranked).mrrAt3>measures(baseline).mrrAt3);
   console.log('Fictional ranking corpus',JSON.stringify({queries:ranked.length,baseline:measures(baseline),reranked:measures(ranked)}));

   const example=seed.fixtures[0];
   await query('INSERT INTO space_grants(space_id,user_id,can_read) VALUES($1,$2,true)',[seed.restricted,actor.id]);
   assert.ok((await retrieveKnowledgeCandidates(actor,example.question,3,null)).some(source=>source.documentId===example.hidden));
   await query('DELETE FROM space_grants WHERE space_id=$1 AND user_id=$2',[seed.restricted,actor.id]);
   await query('UPDATE users SET auth_revision=1 WHERE id=$1',[actor.id]);
   assert.deepEqual(await searchKnowledge(actor,example.question,3),[]);
   assert.ok((await retrieveKnowledgeCandidates({...actor,auth_revision:1},example.question,3,null))
    .every(source=>source.documentId!==example.hidden));
  }finally{
   await query('DELETE FROM documents WHERE id=ANY($1::uuid[])',[[seed.strong,seed.weak,...seed.fixtures.flatMap(item=>[item.target,item.decoy,item.hidden])]]);
   await query('DELETE FROM users WHERE id=$1',[actor.id]);
  }
 });
}

function rank(sources:Source[],documentId:string):number{return sources.findIndex(source=>source.documentId===documentId)+1;}

async function insertDocument(client:PoolClient,userId:string,spaceId:string,title:string,contents:string[],embedding:string|null=null){
 const document=randomUUID();
 const version=randomUUID();
 await client.query("INSERT INTO documents(id,space_id,title,kind) VALUES($1,$2,$3,'ARTICLE')",[document,spaceId,title]);
 await client.query(`INSERT INTO document_versions(id,document_id,version_number,status,index_status,authored_by,content)
  VALUES($1,$2,1,'PUBLISHED','READY',$3,$4)`,[version,document,userId,contents.join('\n')]);
 await client.query('UPDATE documents SET current_version_id=$2 WHERE id=$1',[document,version]);
 await client.query(`INSERT INTO knowledge_chunks(version_id,ordinal,content,embedding)
  SELECT $1,position-1,content,$3::vector FROM unnest($2::text[]) WITH ORDINALITY AS chunks(content,position)`,[version,contents,embedding]);
 return document;
}
