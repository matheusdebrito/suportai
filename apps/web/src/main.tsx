import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrainCircuit,MessageCircle,BookOpen,ShieldCheck,Users,Send,Plus,LogOut,FileUp,Check,RotateCcw,LoaderCircle} from 'lucide-react';
import './styles.css';
type User={id:string;email:string;role:'ADMIN'|'APPROVER'|'USER';mustChangePassword:boolean};
type Space={id:string;name:string;visibility:string;can_read:boolean;can_edit:boolean;can_approve:boolean};
type Doc={id:string;title:string;kind:string;space_name:string};
type Message={id?:string;role:'user'|'assistant';content:string;sources?:{documentId:string;versionId:string;title:string}[]};
type Pending={id:string;title:string;content:string};
type Review={version_id:string;document_id:string;title:string;space_name:string;status:string;index_status:string;content:string};
async function api<T=any>(path:string,init:RequestInit={}):Promise<T> {
 const response=await fetch(path,{...init,credentials:'include',headers:{...(init.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(init.headers||{})}});
 const result=await response.json().catch(()=>({error:'Resposta inválida do servidor'}));
 if(!response.ok) throw new Error(result.error||'Falha na operação');
 return result;
}
function App(){
 const [user,setUser]=useState<User|null>(null);
 const [loading,setLoading]=useState(true);
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [resetToken,setResetToken]=useState('');
 const [showReset,setShowReset]=useState(false);
 const [newPassword,setNewPassword]=useState('');
 const [tab,setTab]=useState<'chat'|'knowledge'|'reviews'|'admin'>('chat');
 const [spaces,setSpaces]=useState<Space[]>([]);
 const [docs,setDocs]=useState<Doc[]>([]);
 const [messages,setMessages]=useState<Message[]>([]);
 const [conversationId,setConversationId]=useState<string|null>(null);
 const [input,setInput]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [pending,setPending]=useState<Pending[]>([]);
 const [review,setReview]=useState<Review[]>([]);
 const [title,setTitle]=useState('');
 const [content,setContent]=useState('');
 const [spaceId,setSpaceId]=useState('');
 const [lastDraft,setLastDraft]=useState<string|null>(null);
 const [selectedDoc,setSelectedDoc]=useState<{title:string;version:{content:string;version_number:number}}|null>(null);
 const [users,setUsers]=useState<Array<{id:string;email:string;role:string;active:boolean}>>([]);
 const [newEmail,setNewEmail]=useState('');
 const [newRole,setNewRole]=useState<'USER'|'APPROVER'|'ADMIN'>('USER');
 const [temporary,setTemporary]=useState('');
 useEffect(()=>{api<User>('/auth/me').then(setUser).catch(()=>{}).finally(()=>setLoading(false));},[]);
 useEffect(()=>{if(!user)return;void refresh();},[user]);
 async function refresh(){
  const [s,d]=await Promise.all([api<{spaces:Space[]}>('/spaces'),api<{documents:Doc[]}>('/knowledge/documents')]);
  setSpaces(s.spaces);setDocs(d.documents);setSpaceId(prev=>prev||s.spaces.find(x=>x.can_edit)?.id||'');
  if(user?.role==='APPROVER'){const reviews=await api<{reviews:Review[]}>('/knowledge/reviews');setReview(reviews.reviews);}
  if(user?.role==='ADMIN'){const result=await api<{users:typeof users}>('/admin/users');setUsers(result.users);}
 }
 function failed(e:unknown){setError(e instanceof Error?e.message:'Falha desconhecida');}
 async function login(e:React.FormEvent){e.preventDefault();setError('');try{const r=await api<{user:User}>('/auth/login',{method:'POST',body:JSON.stringify({email,password})});setUser(r.user);}catch(e){failed(e);}}
 async function changePassword(e:React.FormEvent){e.preventDefault();setError('');try{await api('/auth/change-password',{method:'POST',body:JSON.stringify({resetToken,newPassword})});const u=await api<User>('/auth/me');setUser(u);setResetToken('');setNewPassword('');}catch(e){failed(e);}}
 async function logout(){await api('/auth/logout',{method:'POST'}).catch(()=>{});setUser(null);setMessages([]);setConversationId(null);}
 async function send(e:React.FormEvent){
  e.preventDefault();if(!input.trim()||busy)return;setBusy(true);setError('');
  const text=input;setInput('');setMessages(m=>[...m,{role:'user',content:text}]);
  try{
   let id=conversationId;
   if(!id){const created=await api<{id:string}>('/conversations',{method:'POST'});id=created.id;setConversationId(id);}
   const answer=await api<{id:string;answer:string;sources:Message['sources'];pendingActions:Pending[]}>(`/conversations/${id}/messages`,{method:'POST',body:JSON.stringify({message:text})});
   setMessages(m=>[...m,{id:answer.id,role:'assistant',content:answer.answer,sources:answer.sources}]);
   setPending(m=>[...m,...answer.pendingActions]);
  }catch(e){failed(e);}finally{setBusy(false);}
 }
 async function confirmPending(id:string){setError('');try{
  const r=await api<{versionId:string}>(`/knowledge/pending/${id}/confirm`,{method:'POST'});
  setPending(p=>p.filter(x=>x.id!==id));setLastDraft(r.versionId);
  setTab('knowledge');await refresh();
 }catch(e){failed(e);}}
 async function saveArticle(e:React.FormEvent){e.preventDefault();setError('');try{
  const r=await api<{versionId:string}>('/knowledge/articles',{method:'POST',body:JSON.stringify({spaceId,title,content})});
  setLastDraft(r.versionId);setTitle('');setContent('');await refresh();
 }catch(e){failed(e);}}
 async function uploadPdf(e:React.ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];if(!file)return;setError('');
  try{const form=new FormData();form.append('spaceId',spaceId);form.append('file',file);
   const r=await api<{versionId:string}>('/knowledge/pdfs',{method:'POST',body:form});
   setLastDraft(r.versionId);await refresh();
  }catch(err){failed(err);}finally{e.target.value='';}
 }
 async function submitVersion(id:string){setError('');try{await api(`/knowledge/versions/${id}/submit-review`,{method:'POST'});setLastDraft(null);await refresh();}catch(e){failed(e);}}
 async function decide(id:string,action:'publish'|'reject'){setError('');try{await api(`/knowledge/versions/${id}/${action}`,{method:'POST',body:JSON.stringify(action==='publish'?{confirm:true}:{})});await refresh();}catch(e){failed(e);}}
 async function openDoc(id:string){try{setSelectedDoc(await api(`/knowledge/documents/${id}`));}catch(e){failed(e);}}
 async function createUser(e:React.FormEvent){e.preventDefault();setError('');try{
  const r=await api<{resetToken:string}>('/admin/users',{method:'POST',body:JSON.stringify({email:newEmail,role:newRole})});
  setTemporary(r.resetToken);setNewEmail('');await refresh();
 }catch(e){failed(e);}}
 async function resetUser(id:string){try{const r=await api<{resetToken:string}>(`/admin/users/${id}/reset-password`,{method:'POST'});setTemporary(r.resetToken);}catch(e){failed(e);}}
 async function grant(userId:string,space:string){try{await api(`/admin/spaces/${space}/grants`,{method:'POST',body:JSON.stringify({userId,read:true,edit:true,approve:true})});await refresh();}catch(e){failed(e);}}
 if(loading)return <div className="center"><LoaderCircle className="spin"/> Carregando...</div>;
 if(!user)return <main className="login-page"><div className="login-card"><div className="logo"><BrainCircuit/> SuportAI</div><h1>Seu conhecimento, mais acessível.</h1><p>Assistente inteligente para o dia a dia da TI.</p>{showReset?<form onSubmit={async e=>{await changePassword(e);setShowReset(false);}}><label>Código temporário<input value={resetToken} onChange={e=>setResetToken(e.target.value)} required/></label><label>Nova senha (12+ caracteres)<input type="password" minLength={12} value={newPassword} onChange={e=>setNewPassword(e.target.value)} required/></label><button>Ativar minha conta / trocar senha</button></form>:<form onSubmit={login}><label>E-mail<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Senha<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button>Entrar</button></form>}<button className="secondary" style={{width:'100%',marginTop:12}} onClick={()=>{setShowReset(!showReset);setError('');}}>{showReset?'Voltar ao login':'Tenho um código temporário'}</button><p className="hint">Contas são criadas pelo administrador.</p>{error&&<p className="error" role="alert">{error}</p>}</div></main>;
 if(user.mustChangePassword)return <main className="login-page"><div className="login-card"><h2>Troca de senha obrigatória</h2><p>Utilize o código temporário fornecido pelo administrador.</p><form onSubmit={changePassword}><label>Código temporário<input value={resetToken} onChange={e=>setResetToken(e.target.value)} required/></label><label>Nova senha (12+ caracteres)<input type="password" minLength={12} value={newPassword} onChange={e=>setNewPassword(e.target.value)} required/></label><button>Alterar senha</button></form>{error&&<p className="error">{error}</p>}</div></main>;
 const editable=spaces.filter(x=>x.can_edit);
 return <div className="app"><aside className="sidebar"><div className="logo"><BrainCircuit/> SuportAI</div><nav>
  <button className={tab==='chat'?'active':''} onClick={()=>setTab('chat')}><MessageCircle size={18}/> Assistente</button>
  <button className={tab==='knowledge'?'active':''} onClick={()=>setTab('knowledge')}><BookOpen size={18}/> Conhecimento</button>
  {user.role==='APPROVER'&&<button className={tab==='reviews'?'active':''} onClick={()=>{setTab('reviews');void refresh();}}><ShieldCheck size={18}/> Revisão</button>}
  {user.role==='ADMIN'&&<button className={tab==='admin'?'active':''} onClick={()=>setTab('admin')}><Users size={18}/> Usuários</button>}
  </nav><div className="sidebar-footer"><div className="identity">{user.email}<small>{user.role}</small></div><button onClick={logout}><LogOut size={17}/> Sair</button></div></aside>
 <main className="main"><header><div><strong>{tab==='chat'?'Assistente':tab==='knowledge'?'Base de conhecimento':tab==='reviews'?'Central de revisão':'Administração'}</strong><p>{tab==='chat'?'Pergunte, investigue e registre soluções com segurança.':'Conhecimento revisado, rastreável e acessível.'}</p></div>{tab==='chat'&&<button className="secondary" onClick={()=>{setMessages([]);setConversationId(null);setPending([]);}}> <Plus size={16}/> Nova conversa</button>}</header>
 {error&&<div className="error" role="alert">{error}<button className="ghost" onClick={()=>setError('')}>Fechar</button></div>}
 {tab==='chat'&&<section className="chat"><div className="chat-history">{messages.length===0&&<div className="empty"><BrainCircuit size={40}/><h2>Como posso ajudar?</h2><p>Consulte procedimentos, investigue problemas ou peça para preparar um artigo no cérebro.</p><div className="suggestions">{['Como consultar procedimentos de rede?','Como registrar um procedimento novo?','O que fazer quando um servidor não responde?'].map(x=><button key={x} onClick={()=>setInput(x)}>{x}</button>)}</div></div>}
  {messages.map((m,i)=><div className={'bubble '+m.role} key={m.id||i}><div className="bubble-role">{m.role==='user'?'Você':'SuportAI'}</div><div className="formatted">{m.content}</div>{Boolean(m.sources?.length)&&<div className="sources"><strong>Fontes consultadas</strong>{m.sources!.map((s,j)=><button key={j} onClick={()=>openDoc(s.documentId)}>{s.title} · versão {s.versionId.slice(0,8)}</button>)}</div>}</div>)}
  {busy&&<p className="hint"><LoaderCircle className="spin" size={16}/> Consultando conhecimento...</p>}
  {pending.map(p=><div className="pending" key={p.id}><strong>Prévia: {p.title}</strong><p>{p.content.slice(0,900)}</p><button onClick={()=>confirmPending(p.id)}><Check size={16}/> Confirmar criação de rascunho</button></div>)}
  </div><form className="composer" onSubmit={send}><textarea placeholder="Digite sua pergunta..." value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send(e as unknown as React.FormEvent);}}}/><button disabled={busy||!input.trim()} aria-label="Enviar mensagem"><Send size={19}/></button></form></section>}
 {tab==='knowledge'&&<div className="columns"><section className="panel"><h2>Artigos e documentos publicados</h2>{docs.length===0?<p className="hint">Nenhum documento publicado ainda.</p>:docs.map(d=><button className="item" key={d.id} onClick={()=>openDoc(d.id)}><BookOpen size={17}/><span>{d.title}<small>{d.space_name} · {d.kind}</small></span></button>)}
 {selectedDoc&&<article className="document"><h3>{selectedDoc.title}</h3><small>Versão {selectedDoc.version.version_number}</small><div className="formatted">{selectedDoc.version.content}</div></article>}</section><section className="panel"><h2>Adicionar conhecimento</h2><p className="hint">Crie um artigo ou importe um PDF. O conteúdo só ficará público após revisão.</p>
 {editable.length===0?<p>Você não possui permissão de edição.</p>:<><label>Espaço<select value={spaceId} onChange={e=>setSpaceId(e.target.value)}>{editable.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
 <form onSubmit={saveArticle}><label>Título<input required minLength={3} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Procedimento<textarea required minLength={20} value={content} onChange={e=>setContent(e.target.value)} rows={7}/></label><button><Plus size={17}/> Criar rascunho</button></form>
 <label className="upload"><FileUp size={19}/> Enviar PDF<input type="file" accept="application/pdf,.pdf" onChange={uploadPdf}/></label>
 {lastDraft&&<div className="pending"><p>Rascunho salvo. O processamento pode levar alguns instantes.</p><button onClick={()=>submitVersion(lastDraft)}>Enviar para revisão</button></div>}</>}</section></div>}
 {tab==='reviews'&&<section className="panel"><h2>Conteúdos aguardando revisão</h2>{review.length===0?<p className="hint">Nenhum conteúdo pendente.</p>:review.map(r=><div className="review" key={r.version_id}><h3>{r.title}</h3><small>{r.space_name} · {r.status} · Indexação: {r.index_status}</small><div className="formatted">{r.content.slice(0,4000)}</div><div className="actions">{r.status==='DRAFT'&&<button className="secondary" onClick={()=>submitVersion(r.version_id)}>Enviar para revisão</button>}<button disabled={r.status!=='IN_REVIEW'||r.index_status!=='READY'} onClick={()=>decide(r.version_id,'publish')}><Check size={16}/> Publicar</button><button className="danger" onClick={()=>decide(r.version_id,'reject')}>Rejeitar</button></div></div>)}</section>}
 {tab==='admin'&&<div className="columns"><section className="panel"><h2>Cadastrar colaborador</h2><form onSubmit={createUser}><label>E-mail<input required type="email" value={newEmail} onChange={e=>setNewEmail(e.target.value)}/></label><label>Perfil<select value={newRole} onChange={e=>setNewRole(e.target.value as typeof newRole)}><option value="USER">Colaborador</option><option value="APPROVER">Aprovador de conhecimento</option><option value="ADMIN">Administrador</option></select></label><button>Criar usuário</button></form>{temporary&&<div className="pending"><strong>Código temporário (visível apenas agora)</strong><code>{temporary}</code><p className="hint">Entregue ao usuário por canal seguro. Válido por 15 minutos.</p><button className="secondary" onClick={()=>{void navigator.clipboard.writeText(temporary);}}>Copiar</button></div>}</section><section className="panel"><h2>Usuários</h2>{users.map(u=><div className="item user-item" key={u.id}><span>{u.email}<small>{u.role} · {u.active?'Ativo':'Inativo'}</small></span><button className="secondary" onClick={()=>resetUser(u.id)}><RotateCcw size={14}/> Redefinir</button><select aria-label={'Conceder acesso a '+u.email} defaultValue="" onChange={e=>{if(e.target.value)void grant(u.id,e.target.value);e.target.value='';}}><option value="">Conceder acesso...</option>{spaces.filter(s=>s.visibility==='RESTRICTED').map(s=><option key={s.id} value={s.id}>{s.name} (leitura/edição/aprovação)</option>)}</select></div>)}</section></div>}
 </main></div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
