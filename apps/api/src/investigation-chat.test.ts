import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,query} from './db.js';
import {buildApp} from './server.js';
import {hashToken} from './security.js';
import {readInvestigationState,saveInvestigationState,type InvestigationDraft} from './investigation-state.js';

if(!process.env.TEST_DATABASE_URL){
  test('investigation chat requires an isolated PostgreSQL test database',{skip:'No TEST_DATABASE_URL'},()=>{});
}else{
  if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw new Error('Investigation chat tests require DATABASE_URL to equal TEST_DATABASE_URL');
  after(()=>pool.end());

  test('chat resumes an investigation outside the last 60 messages and keeps different subjects apart',async()=>{
    const {actor,headers}=await createSession();
    const calls:{message:string;history:string[];state?:InvestigationDraft}[]=[];
    const app=await buildApp({agentResponder:async(_actor,_conversation,message,history,_provider,_search,options)=>{
      calls.push({message,history:history.map(entry=>entry.content),state:options?.investigation});
      return {answer:options?.investigation?.reportedFacts.join(' ')||'Resposta simulada.',sources:[],pendingActions:[]};
    }});
    try{
      const created=await app.inject({method:'POST',url:'/conversations',headers});
      assert.equal(created.statusCode,200);
      const {id:conversation}=created.json<{id:string}>();
      const send=async(message:string)=>{
        const result=await app.inject({method:'POST',url:`/conversations/${conversation}/messages`,headers,payload:{message}});
        assert.equal(result.statusCode,200,result.body);
        return result.json<{answer:string;id:string}>();
      };
      const printerFact='Minha impressora não imprime documentos da fila âmbar.';
      await send(printerFact);
      await send('Testei imprimir uma etiqueta, o resultado foi papel em branco.');
      await send('Acho que o trabalho não chegou à fila.');
      assert.equal(calls.at(-1)?.state?.tests[0].result,'papel em branco.');

      const wifiFact='Mudando de assunto: Wi-Fi, agora cai no laboratório.';
      await send(wifiFact);
      assert.deepEqual(calls.at(-1)?.history,[]);
      assert.equal(calls.at(-1)?.state,undefined);
      await send('Ainda cai toda vez que conecto.');
      assert.equal(calls.at(-1)?.state?.topic,'Wi-Fi');
      assert.deepEqual(calls.at(-1)?.state?.reportedFacts,[wifiFact]);
      assert.ok(calls.at(-1)?.history.every(value=>!value.includes('fila âmbar')));

      const records=await pool.query<{id:string;topic:string}>('SELECT id,topic FROM investigations WHERE conversation_id=$1',[conversation]);
      assert.equal(records.rowCount,2);
      const printer=records.rows.find(row=>row.topic==='impressora');
      const wifi=records.rows.find(row=>row.topic==='Wi-Fi');
      assert.ok(printer&&wifi);
      await query("UPDATE messages SET created_at=now()-interval '1 day' WHERE conversation_id=$1 AND investigation_id=$2",[conversation,printer.id]);
      await query(`INSERT INTO messages(conversation_id,role,content,auth_revision,created_at,investigation_id)
        SELECT $1,'user','Mensagem recente sobre Wi-Fi '||n,0,now()-interval '2 hours'+n*interval '1 second',$2
        FROM generate_series(1,65) AS n`,[conversation,wifi.id]);
      const wifiBefore=await readInvestigationState(actor,conversation,wifi.id);

      const resumed=await send('Voltando ao problema da impressora, agora a luz pisca.');
      const call=calls.at(-1);
      assert.deepEqual(call?.history,[]);
      assert.equal(call?.state?.topic,'impressora');
      assert.deepEqual(call?.state?.reportedFacts,[printerFact]);
      assert.deepEqual(call?.state?.hypotheses,['Acho que o trabalho não chegou à fila.']);
      assert.equal(call?.state?.tests[0].result,'papel em branco.');
      assert.equal(resumed.answer,printerFact);
      const printerAfter=await readInvestigationState(actor,conversation,printer.id);
      assert.equal(printerAfter?.revision,4);
      assert.deepEqual(printerAfter?.reportedFacts,[printerFact,'Voltando ao problema da impressora, agora a luz pisca.']);
      assert.deepEqual(await readInvestigationState(actor,conversation,wifi.id),wifiBefore);

      await send('Agora continua piscando.');
      assert.equal(calls.at(-1)?.state?.topic,'impressora');
      await send('Voltar para o assunto do servidor desconhecido.');
      assert.equal(calls.at(-1)?.message,'Agora continua piscando.');
    }finally{
      await app.close();
      await query('DELETE FROM users WHERE id=$1',[actor.id]);
    }
  });

  test('chat hides a reply derived from a source after that source is archived',async()=>{
    const {actor,headers}=await createSession();
    const document=randomUUID();
    const version=randomUUID();
    const app=await buildApp({agentResponder:async(_actor,_conversation,_message,_history,_provider,_search,options)=>({
      answer:options?.investigation?.reportedFacts[0]??'Sem contexto.',sources:[],pendingActions:[]
    })});
    try{
      const created=await app.inject({method:'POST',url:'/conversations',headers});
      const {id:conversation}=created.json<{id:string}>();
      await query(`INSERT INTO documents(id,space_id,title,kind)
        SELECT $1,id,'Fonte sintética','ARTICLE' FROM spaces WHERE visibility='SHARED' LIMIT 1`,[document]);
      await query(`INSERT INTO document_versions(id,document_id,version_number,status,index_status,authored_by)
        VALUES($1,$2,1,'PUBLISHED','READY',$3)`,[version,document,actor.id]);
      await query('UPDATE documents SET current_version_id=$2 WHERE id=$1',[document,version]);
      const saved=await saveInvestigationState(actor,conversation,{topic:'Ramal',reportedFacts:['Dependência sintética.'],
        hypotheses:[],openQuestions:[],tests:[],sourceVersionIds:[version]});
      assert.equal(saved.status,'saved');
      const reply=await app.inject({method:'POST',url:`/conversations/${conversation}/messages`,headers,
        payload:{message:'Voltando ao Ramal.'}});
      assert.equal(reply.statusCode,200,reply.body);
      assert.equal(reply.json().answer,'Dependência sintética.');

      await query('UPDATE documents SET archived_at=now() WHERE id=$1',[document]);
      const restored=await app.inject({method:'GET',url:`/conversations/${conversation}`,headers});
      assert.equal(restored.statusCode,200,restored.body);
      assert.equal(restored.json().messages.at(-1).content,'Esta resposta contém fontes arquivadas ou inacessíveis e não pode mais ser exibida.');
      const resumed=await app.inject({method:'POST',url:`/conversations/${conversation}/messages`,headers,
        payload:{message:'Ainda não funcionou.'}});
      assert.equal(resumed.statusCode,200,resumed.body);
      assert.match(resumed.json().answer,/contexto anterior não está disponível/i);
    }finally{
      await app.close();
      await query('DELETE FROM documents WHERE id=$1',[document]);
      await query('DELETE FROM users WHERE id=$1',[actor.id]);
    }
  });
}

async function createSession(){
  const actor={id:randomUUID(),role:'USER' as const,auth_revision:0,must_change_password:false};
  const token=randomUUID();
  await query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'fixture')",[actor.id,`${actor.id}@example.test`]);
  await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[hashToken(token),actor.id]);
  return {actor,headers:{cookie:`suportai_session=${token}`,origin:process.env.APP_ORIGIN||'http://localhost:5173'}};
}
