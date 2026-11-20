import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrainCircuit,MessageCircle,BookOpen,ShieldCheck,Users,Send,Plus,LogOut,FileUp,Check,RotateCcw,LoaderCircle} from 'lucide-react';
import './styles.css';
type User={id:string;email:string;role:'ADMIN'|'APPROVER'|'USER';mustChangePassword:boolean};
type Space={id:string;name:string;visibility:string;can_read:boolean;can_edit:boolean;can_approve:boolean};
type Doc={id:string;title:string;kind:string;space_name:string};
type Message={id?:string;role:'user'|'assistant';content:string;sources?:{documentId:string;versionId:string;versionNumber?:number;title:string}[]};
type Pending={id:string;title:string;content:string;spaceName?:string};
type SimilarArticle={id:string;title:string;kind:'ARTICLE'|'PDF'};
type DuplicatePrompt={source:'panel'|'pending';matches:SimilarArticle[];title:string;spaceId?:string;content?:string;pendingId?:string};
type DuplicateResponseError=Error&{code?:string;matches?:SimilarArticle[]};
type Conversation={id:string;title:string;updated_at:string};
type Draft={version_id:string;document_id:string;title:string;kind:'ARTICLE'|'PDF';version_number:number;status:'DRAFT'|'IN_REVIEW'|'CHANGES_REQUESTED'|'REJECTED';index_status:'READY'|'PENDING'|'FAILED';space_name:string;ingestion_error?:string;review_note?:string};
type DraftDetail=Draft&{content:string;space_id:string};
type DocDetail={id:string;title:string;kind:'ARTICLE'|'PDF';space_id:string;isCurrent?:boolean;version:{id:string;content:string;version_number:number;status:string}};
type Editing={documentId:string;baseVersionId:string};
type Review={version_id:string;document_id:string;title:string;space_name:string;status:string;index_status:string;content:string;base_content?:string|null;ingestion_error?:string};
function textDiff(before:string,after:string){
 const a=before.replace(/\r\n/g,'\n').split('\n'),b=after.replace(/\r\n/g,'\n').split('\n');
 let prefix=0;
 while(prefix<a.length&&prefix<b.length&&a[prefix]===b[prefix])prefix++;
 let suffix=0;
 while(suffix<a.length-prefix&&suffix<b.length-prefix&&a[a.length-1-suffix]===b[b.length-1-suffix])suffix++;
 const oldText=a.slice(prefix,a.length-suffix).join('\n');
 const newText=b.slice(prefix,b.length-suffix).join('\n');
 return {removed:oldText.slice(0,4000),added:newText.slice(0,4000),unchanged:oldText===newText};
}
async function api<T=any>(path:string,init:RequestInit={}):Promise<T> {
 const response=await fetch(path,{...init,credentials:'include',headers:{...(init.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(init.headers||{})}});
 const result=await response.json().catch(()=>({error:'Resposta inválida do servidor'}));
 if(!response.ok) throw Object.assign(new Error(result.error||'Falha na operação'),
   {code:typeof result.code==='string'?result.code:undefined,
    matches:Array.isArray(result.matches)?result.matches:undefined});
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
 const [conversations,setConversations]=useState<Conversation[]>([]);
 const [conversationLoading,setConversationLoading]=useState(false);
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
 const [duplicatePrompt,setDuplicatePrompt]=useState<DuplicatePrompt|null>(null);
 const [duplicateReason,setDuplicateReason]=useState('');
 const [drafts,setDrafts]=useState<Draft[]>([]);
 const [draftView,setDraftView]=useState<DraftDetail|null>(null);
 const [selectedDoc,setSelectedDoc]=useState<DocDetail|null>(null);
 const [editing,setEditing]=useState<Editing|null>(null);
 const [correctionOf,setCorrectionOf]=useState<string|null>(null);
 const [reviewDecision,setReviewDecision]=useState<{id:string;action:'reject'|'request-changes'}|null>(null);
 const [reviewNote,setReviewNote]=useState('');
 const [users,setUsers]=useState<Array<{id:string;email:string;role:string;active:boolean}>>([]);
 const [newEmail,setNewEmail]=useState('');
 const [newRole,setNewRole]=useState<'USER'|'APPROVER'|'ADMIN'>('USER');
 const [temporary,setTemporary]=useState('');
 useEffect(()=>{api<User>('/auth/me').then(setUser).catch(()=>{}).finally(()=>setLoading(false));},[]);
 useEffect(()=>{if(!user||user.mustChangePassword)return;void refresh().catch(failed);void refreshConversations().catch(failed);},[user]);
 async function refresh(){
  const [s,d,mine]=await Promise.all([api<{spaces:Space[]}>('/spaces'),api<{documents:Doc[]}>('/knowledge/documents'),api<{drafts:Draft[]}>('/knowledge/mine')]);
  setSpaces(s.spaces);setDocs(d.documents);setDrafts(mine.drafts);setSpaceId(prev=>prev||s.spaces.find(x=>x.can_edit)?.id||'');
  if(user?.role==='APPROVER'){const reviews=await api<{reviews:Review[]}>('/knowledge/reviews');setReview(reviews.reviews);}
  if(user?.role==='ADMIN'){const result=await api<{users:typeof users}>('/admin/users');setUsers(result.users);}
 }
 function failed(e:unknown){setError(e instanceof Error?e.message:'Falha desconhecida');}
 function duplicateDetected(e:unknown,prompt:Omit<DuplicatePrompt,'matches'>):boolean{
   const error=e as DuplicateResponseError;
   if(error?.code!=='SIMILAR_ARTICLES'||!Array.isArray(error.matches))return false;
   setDuplicatePrompt({...prompt,matches:error.matches});setDuplicateReason('');return true;
 }
 async function continueDuplicate(e:React.FormEvent){
   e.preventDefault();if(!duplicatePrompt)return;
   setError('');
   try{
     if(duplicatePrompt.source==='panel'){
       const created=await api<{versionId:string}>('/knowledge/articles',{
         method:'POST',body:JSON.stringify({
          spaceId:duplicatePrompt.spaceId,title:duplicatePrompt.title,content:duplicatePrompt.content,
          duplicateReason:duplicateReason.trim()
         })
       });
       setTitle('');setContent('');setLastDraft(created.versionId);
     }else{
       const created=await api<{versionId:string}>('/knowledge/pending/'+duplicatePrompt.pendingId+'/confirm',{
         method:'POST',body:JSON.stringify({duplicateReason:duplicateReason.trim()})
       });
       setPending(items=>items.filter(x=>x.id!==duplicatePrompt.pendingId));
       setLastDraft(created.versionId);setTab('knowledge');
     }
     setDuplicatePrompt(null);setDuplicateReason('');
     await refresh();
   }catch(error){failed(error);}
 }

 async function refreshConversations(){
  const result=await api<{conversations:Conversation[]}>('/conversations');
  setConversations(result.conversations);
 }
 async function openConversation(id:string){
  if(busy||conversationLoading)return;
  setConversationLoading(true);setError('');
  try{
   const result=await api<{messages:Message[];pendingActions:Pending[]}>(`/conversations/${id}`);
   setConversationId(id);setMessages(result.messages);setPending(result.pendingActions);
   setInput('');setTab('chat');
  }catch(e){failed(e);}finally{setConversationLoading(false);}
 }
 function newConversation(){
  if(busy||conversationLoading)return;
  setConversationId(null);setMessages([]);setPending([]);setInput('');setError('');setTab('chat');
 }
 async function viewDraft(versionId:string){
  setError('');
  try{setDraftView(await api<DraftDetail>(`/knowledge/drafts/${versionId}`));}
  catch(e){failed(e);}
 }
 function startEditing(){
  if(!selectedDoc||selectedDoc.kind!=='ARTICLE'||selectedDoc.isCurrent===false)return;
  if(!spaces.some(s=>s.id===selectedDoc.space_id&&s.can_edit))return;
  setCorrectionOf(null);
  setEditing({documentId:selectedDoc.id,baseVersionId:selectedDoc.version.id});
  setTitle(selectedDoc.title);setContent(selectedDoc.version.content);setSpaceId(selectedDoc.space_id);
  setLastDraft(null);
 }
 async function startCorrection(versionId:string){
   setError('');
   try{
     const original=await api<DraftDetail>('/knowledge/drafts/'+versionId);
     if(original.status!=='CHANGES_REQUESTED'||original.kind!=='ARTICLE')throw new Error('Este artigo não está disponível para correção');
     setEditing(null);setCorrectionOf(original.version_id);
     setTitle(original.title);setContent(original.content);setSpaceId(original.space_id);
     setTab('knowledge');setLastDraft(null);
   }catch(e){failed(e);}
 }
 function cancelEditing(){setEditing(null);setCorrectionOf(null);setTitle('');setContent('');setLastDraft(null);}

 async function login(e:React.FormEvent){e.preventDefault();setError('');try{const r=await api<{user:User}>('/auth/login',{method:'POST',body:JSON.stringify({email,password})});setPassword('');setUser(r.user);}catch(e){failed(e);}}
 async function changePassword(e:React.FormEvent){e.preventDefault();setError('');try{await api('/auth/change-password',{method:'POST',body:JSON.stringify({resetToken,newPassword})});const u=await api<User>('/auth/me');setUser(u);setResetToken('');setNewPassword('');setShowReset(false);}catch(e){failed(e);}}
 async function logout(){await api('/auth/logout',{method:'POST'}).catch(()=>{});setUser(null);setMessages([]);setConversationId(null);setConversations([]);setDrafts([]);setPending([]);setSelectedDoc(null);setCorrectionOf(null);setReviewNote('');setReviewDecision(null);setDuplicatePrompt(null);}
 async function send(e:React.FormEvent){
  e.preventDefault();if(!input.trim()||busy||conversationLoading)return;setBusy(true);setError('');
  const text=input;setInput('');setMessages(m=>[...m,{role:'user',content:text}]);
  try{
   let id=conversationId;
   if(!id){const created=await api<{id:string}>('/conversations',{method:'POST'});id=created.id;setConversationId(id);}
   const answer=await api<{id:string;answer:string;sources:Message['sources'];pendingActions:Pending[]}>(`/conversations/${id}/messages`,{method:'POST',body:JSON.stringify({message:text})});
   setMessages(m=>[...m,{id:answer.id,role:'assistant',content:answer.answer,sources:answer.sources}]);
   setPending(m=>[...m,...answer.pendingActions]);
   await refreshConversations();
  }catch(e){failed(e);}finally{setBusy(false);}
 }
 async function confirmPending(id:string){setError('');try{
   const r=await api<{versionId:string}>('/knowledge/pending/'+id+'/confirm',{method:'POST'});
   setPending(p=>p.filter(x=>x.id!==id));setLastDraft(r.versionId);
   setTab('knowledge');await refresh();
 }catch(error){
   const pendingAction=pending.find(p=>p.id===id);
   if(!duplicateDetected(error,{source:'pending',pendingId:id,title:pendingAction?.title||'Proposta de artigo'}))failed(error);
 }}
 async function saveArticle(e:React.FormEvent){e.preventDefault();setError('');try{
   const r=correctionOf
     ? await api<{versionId:string}>('/knowledge/versions/'+correctionOf+'/correct',{method:'POST',body:JSON.stringify({content})})
     : editing
       ? await api<{versionId:string}>('/knowledge/documents/'+editing.documentId+'/versions',{method:'POST',body:JSON.stringify({content,baseVersionId:editing.baseVersionId})})
       : await api<{versionId:string}>('/knowledge/articles',{method:'POST',body:JSON.stringify({spaceId,title,content})});
   setLastDraft(r.versionId);setEditing(null);setCorrectionOf(null);setTitle('');setContent('');await refresh();
 }catch(error){
   if(!editing&&!correctionOf&&duplicateDetected(error,{source:'panel',spaceId,title,content}))return;
   failed(error);
 }}
 async function uploadPdf(e:React.ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];if(!file)return;setError('');
  try{const form=new FormData();form.append('spaceId',spaceId);form.append('file',file);
   const r=await api<{versionId:string}>('/knowledge/pdfs',{method:'POST',body:form});
   setLastDraft(r.versionId);await refresh();
  }catch(err){failed(err);}finally{e.target.value='';}
 }
 async function retryVersion(id:string){setError('');try{await api(`/knowledge/versions/${id}/retry`,{method:'POST'});await refresh();}catch(e){failed(e);}}
 async function submitVersion(id:string){setError('');try{await api(`/knowledge/versions/${id}/submit-review`,{method:'POST'});setLastDraft(null);await refresh();}catch(e){failed(e);}}
 async function publishVersion(id:string){setError('');try{
   await api('/knowledge/versions/'+id+'/publish',{method:'POST',body:JSON.stringify({confirm:true})});
   await refresh();
 }catch(e){failed(e);}}
 async function sendReviewDecision(e:React.FormEvent){e.preventDefault();if(!reviewDecision)return;
   setError('');
   try{
     await api('/knowledge/versions/'+reviewDecision.id+'/'+reviewDecision.action,{
       method:'POST',body:JSON.stringify({note:reviewNote.trim()})
     });
     setReviewDecision(null);setReviewNote('');
     await refresh();
   }catch(e){failed(e);}
 }
 async function openDoc(id:string){try{setSelectedDoc(await api(`/knowledge/documents/${id}`));setTab('knowledge');}catch(e){failed(e);}}
 async function openSource(documentId:string,versionId:string){try{
  setSelectedDoc(await api(`/knowledge/documents/${documentId}/versions/${versionId}`));
  setTab('knowledge');
 }catch(e){failed(e);}}
 async function createUser(e:React.FormEvent){e.preventDefault();setError('');try{
  const r=await api<{resetToken:string}>('/admin/users',{method:'POST',body:JSON.stringify({email:newEmail,role:newRole})});
  setTemporary(r.resetToken);setNewEmail('');await refresh();
 }catch(e){failed(e);}}
 async function resetUser(id:string){try{const r=await api<{resetToken:string}>(`/admin/users/${id}/reset-password`,{method:'POST'});setTemporary(r.resetToken);}catch(e){failed(e);}}
 async function updateUser(id:string,update:{active?:boolean;role?:'USER'|'APPROVER'|'ADMIN'}){
  setError('');
  try{
   await api(`/admin/users/${id}`,{method:'PATCH',body:JSON.stringify(update)});
   await refresh();
  }catch(e){failed(e);}
 }
 async function grant(userId:string,space:string,mode:string){try{
  await api(`/admin/spaces/${space}/grants`,{method:'POST',body:JSON.stringify({userId,read:mode!=='NONE',edit:mode==='EDIT'||mode==='APPROVE',approve:mode==='APPROVE'})});
  await refresh();
 }catch(e){failed(e);}}
 if(loading)return <div className="center"><LoaderCircle className="spin"/> Carregando...</div>;
 if(!user)return <main className="login-page"><div className="login-card"><div className="logo"><BrainCircuit/> SuportAI</div><h1>Seu conhecimento, mais acessível.</h1><p>Assistente inteligente para o dia a dia da TI.</p>{showReset?<form onSubmit={changePassword}><label>Código temporário<input value={resetToken} onChange={e=>setResetToken(e.target.value)} required/></label><label>Nova senha (12+ caracteres)<input type="password" minLength={12} value={newPassword} onChange={e=>setNewPassword(e.target.value)} required/></label><button>Ativar minha conta / trocar senha</button></form>:<form onSubmit={login}><label>E-mail<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Senha<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button>Entrar</button></form>}<button className="secondary" style={{width:'100%',marginTop:12}} onClick={()=>{setShowReset(!showReset);setError('');}}>{showReset?'Voltar ao login':'Tenho um código temporário'}</button><p className="hint">Contas são criadas pelo administrador.</p>{error&&<p className="error" role="alert">{error}</p>}</div></main>;
 if(user.mustChangePassword)return <main className="login-page"><div className="login-card"><h2>Troca de senha obrigatória</h2><p>Utilize o código temporário fornecido pelo administrador.</p><form onSubmit={changePassword}><label>Código temporário<input value={resetToken} onChange={e=>setResetToken(e.target.value)} required/></label><label>Nova senha (12+ caracteres)<input type="password" minLength={12} value={newPassword} onChange={e=>setNewPassword(e.target.value)} required/></label><button>Alterar senha</button></form>{error&&<p className="error">{error}</p>}</div></main>;
 const editable=spaces.filter(x=>x.can_edit);
 return <div className="app"><aside className="sidebar"><div className="logo"><BrainCircuit/> SuportAI</div><nav>
  <button className={tab==='chat'?'active':''} onClick={()=>setTab('chat')}><MessageCircle size={18}/> Assistente</button>
  <button className={tab==='knowledge'?'active':''} onClick={()=>setTab('knowledge')}><BookOpen size={18}/> Conhecimento</button>
  {user.role==='APPROVER'&&<button className={tab==='reviews'?'active':''} onClick={()=>{setTab('reviews');void refresh();}}><ShieldCheck size={18}/> Revisão</button>}
  {user.role==='ADMIN'&&<button className={tab==='admin'?'active':''} onClick={()=>setTab('admin')}><Users size={18}/> Usuários</button>}
  </nav><div className="sidebar-footer"><div className="identity">{user.email}<small>{user.role}</small></div><button onClick={logout}><LogOut size={17}/> Sair</button></div></aside>
 <main className="main"><header><div><strong>{tab==='chat'?'Assistente':tab==='knowledge'?'Base de conhecimento':tab==='reviews'?'Central de revisão':'Administração'}</strong><p>{tab==='chat'?'Pergunte, investigue e registre soluções com segurança.':'Conhecimento revisado, rastreável e acessível.'}</p></div>{tab==='chat'&&<button className="secondary" disabled={busy||conversationLoading} onClick={newConversation}><Plus size={16}/> Nova conversa</button>}</header>
 {error&&<div className="error" role="alert">{error}<button className="ghost" onClick={()=>setError('')}>Fechar</button></div>}
 {tab==='chat'&&<div className="chat-layout"><aside className="conversations-panel"><div className="conversations-heading"><strong>Conversas</strong><button className="secondary" disabled={busy||conversationLoading} onClick={()=>void refreshConversations().catch(failed)} aria-label="Atualizar conversas"><RotateCcw size={15}/></button></div>{conversations.length===0?<p className="hint">Suas conversas aparecem aqui depois da primeira mensagem.</p>:conversations.map(c=><button key={c.id} disabled={busy||conversationLoading} className={'conversation-item '+(conversationId===c.id?'selected':'')} onClick={()=>void openConversation(c.id)}><span>{c.title}</span><small>{new Date(c.updated_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</small></button>)}</aside><section className="chat"><div className="chat-history">{conversationLoading&&<p className="hint"><LoaderCircle className="spin" size={16}/> Abrindo conversa...</p>}{messages.length===0&&<div className="empty"><BrainCircuit size={40}/><h2>Como posso ajudar?</h2><p>Consulte procedimentos, investigue problemas ou peça para preparar um artigo no cérebro.</p><div className="suggestions">{['Como consultar procedimentos de rede?','Como registrar um procedimento novo?','O que fazer quando um servidor não responde?'].map(x=><button key={x} onClick={()=>setInput(x)}>{x}</button>)}</div></div>}
  {messages.map((m,i)=><div className={'bubble '+m.role} key={m.id||i}><div className="bubble-role">{m.role==='user'?'Você':'SuportAI'}</div><div className="formatted">{m.content}</div>{Boolean(m.sources?.length)&&<div className="sources"><strong>Fontes consultadas</strong>{m.sources!.map((s,j)=><button key={j} onClick={()=>openSource(s.documentId,s.versionId)}>{s.title} · versão {s.versionNumber??s.versionId.slice(0,8)}</button>)}</div>}</div>)}
  {busy&&<p className="hint"><LoaderCircle className="spin" size={16}/> Consultando conhecimento...</p>}
  {pending.map(p=><div className="pending" key={p.id}><strong>Prévia: {p.title}</strong><small>Destino: {p.spaceName||'Espaço autorizado'}</small><p>{p.content.slice(0,900)}</p><button onClick={()=>confirmPending(p.id)}><Check size={16}/> Confirmar criação de rascunho</button></div>)}
  </div><form className="composer" onSubmit={send}><textarea placeholder="Digite sua pergunta..." value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send(e as unknown as React.FormEvent);}}}/><button disabled={busy||conversationLoading||!input.trim()} aria-label="Enviar mensagem"><Send size={19}/></button></form></section></div>}
 {tab==='knowledge'&&<div className="columns"><section className="panel"><h2>Artigos e documentos publicados</h2>{docs.length===0?<p className="hint">Nenhum documento publicado ainda.</p>:docs.map(d=><button className="item" key={d.id} onClick={()=>openDoc(d.id)}><BookOpen size={17}/><span>{d.title}<small>{d.space_name} · {d.kind}</small></span></button>)}
 {selectedDoc&&<article className="document"><h3>{selectedDoc.title}</h3><small>Versão {selectedDoc.version.version_number}</small><div className="formatted">{selectedDoc.version.content}</div>{selectedDoc.kind==='ARTICLE'&&selectedDoc.isCurrent!==false&&spaces.some(s=>s.id===selectedDoc.space_id&&s.can_edit)&&<button className="secondary" onClick={startEditing}>Criar revisão deste artigo</button>}</article>}
  <div className="drafts-header"><h2>Meus rascunhos</h2><button className="secondary" onClick={()=>void refresh().catch(failed)}><RotateCcw size={14}/> Atualizar</button></div>
  {drafts.length===0?<p className="hint">Nenhum rascunho ou revisão pendente.</p>:drafts.map(d=><div className="draft-item" key={d.version_id}><strong>{d.title}</strong><small>{d.space_name} · v{d.version_number} · {d.status==='DRAFT'?'Rascunho':d.status==='IN_REVIEW'?'Em revisão':d.status==='CHANGES_REQUESTED'?'Ajustes solicitados':'Rejeitado'} · Índice: {d.index_status}</small>{d.ingestion_error&&<p className="error">{d.ingestion_error}</p>}{d.review_note&&<p className="review-note"><strong>Parecer:</strong> {d.review_note}</p>}<div className="actions"><button className="secondary" onClick={()=>void viewDraft(d.version_id)}>Ver texto</button>{d.status==='DRAFT'&&d.index_status==='READY'&&<button className="secondary" onClick={()=>void submitVersion(d.version_id)}>Enviar para revisão</button>}{d.status==='CHANGES_REQUESTED'&&d.kind==='ARTICLE'&&<button className="secondary" onClick={()=>void startCorrection(d.version_id)}>Preparar correção</button>}{d.status==='CHANGES_REQUESTED'&&d.kind==='PDF'&&<span className="hint">Reenvie o PDF corrigido.</span>}{d.index_status==='FAILED'&&d.status!=='REJECTED'&&d.status!=='CHANGES_REQUESTED'&&<button className="secondary" onClick={()=>void retryVersion(d.version_id)}>Reprocessar</button>}</div></div>)}
  {draftView&&<article className="document"><div className="drafts-header"><h3>{draftView.title} · v{draftView.version_number}</h3><button className="ghost" onClick={()=>setDraftView(null)}>Fechar</button></div><small>{draftView.status}</small><div className="formatted">{draftView.content||'Aguardando extração do PDF.'}</div></article>}
  </section><section className="panel"><h2>{correctionOf?'Corrigir proposta':editing?'Propor atualização':'Adicionar conhecimento'}</h2><p className="hint">{correctionOf?'A correção será uma nova versão em rascunho.':editing?'A revisão só substituirá o artigo publicado após aprovação.':'Crie um artigo ou importe um PDF. O conteúdo só ficará público após revisão.'}</p>
 {editable.length===0?<p>Você não possui permissão de edição.</p>:<><label>Espaço<select value={spaceId} disabled={Boolean(editing||correctionOf)} onChange={e=>setSpaceId(e.target.value)}>{editable.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
 <form onSubmit={saveArticle}><label>Título<input required minLength={3} value={title} readOnly={Boolean(editing||correctionOf)} onChange={e=>setTitle(e.target.value)}/></label><label>Procedimento<textarea required minLength={20} value={content} onChange={e=>setContent(e.target.value)} rows={7}/></label><button><Plus size={17}/> {correctionOf?'Salvar correção em novo rascunho':editing?'Salvar proposta de revisão':'Criar rascunho'}</button>{(editing||correctionOf)&&<button type="button" className="secondary" onClick={cancelEditing}>Cancelar edição</button>}</form>
 {editing&&<details className="diff-preview"><summary>Comparar alterações com a versão publicada</summary>{(()=>{
   const changes=textDiff(selectedDoc?.version.content||'',content);
   return changes.unchanged?<p className="hint">Nenhuma mudança detectada.</p>:<div className="diff-columns"><div><strong>Removido</strong><pre className="diff-removed">{changes.removed||'Nenhum trecho removido'}</pre></div><div><strong>Adicionado</strong><pre className="diff-added">{changes.added||'Nenhum trecho adicionado'}</pre></div></div>;
 })()}</details>}
 <label className="upload"><FileUp size={19}/> Enviar PDF<input type="file" accept="application/pdf,.pdf" onChange={uploadPdf}/></label>
 {lastDraft&&<div className="pending"><p>Rascunho salvo. Aguarde o processamento; consulte “Meus rascunhos” para enviar para revisão quando estiver pronto.</p><button className="secondary" onClick={()=>{setLastDraft(null);void refresh().catch(failed);}}>Atualizar rascunhos</button></div>}</>}</section></div>}
 {tab==='reviews'&&<section className="panel"><h2>Conteúdos em revisão</h2>{review.length===0?<p className="hint">Nenhum conteúdo pendente.</p>:review.map(r=><div className="review" key={r.version_id}>
  <h3>{r.title}</h3><small>{r.space_name} · {r.status} · Indexação: {r.index_status}</small>
  {r.ingestion_error&&<p className="error">{r.ingestion_error}</p>}
  <div className="formatted">{r.content.slice(0,4000)}</div>
  {r.base_content!=null&&<details className="diff-preview"><summary>O que mudou em relação à versão publicada?</summary>{(()=>{
   const changes=textDiff(r.base_content||'',r.content);
   return changes.unchanged?<p className="hint">Nenhuma mudança de texto detectada.</p>:<div className="diff-columns"><div><strong>Removido</strong><pre className="diff-removed">{changes.removed||'Nenhum trecho removido'}</pre></div><div><strong>Adicionado</strong><pre className="diff-added">{changes.added||'Nenhum trecho adicionado'}</pre></div></div>;
  })()}</details>}
  <div className="actions">
   <button disabled={r.status!=='IN_REVIEW'||r.index_status!=='READY'} onClick={()=>void publishVersion(r.version_id)}><Check size={16}/> Publicar</button>
   <button className="secondary" onClick={()=>{setReviewDecision({id:r.version_id,action:'request-changes'});setReviewNote('');}}>Solicitar ajustes</button>
   <button className="danger" onClick={()=>{setReviewDecision({id:r.version_id,action:'reject'});setReviewNote('');}}>Rejeitar</button>
  </div>
  {reviewDecision?.id===r.version_id&&<form className="review-decision-form" onSubmit={sendReviewDecision}>
   <label>{reviewDecision.action==='request-changes'?'O que precisa ser corrigido?':'Motivo da rejeição'}
    <textarea required minLength={10} maxLength={2000} rows={3} value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="Escreva um parecer claro para o autor..."/>
   </label>
   <div className="actions"><button>{reviewDecision.action==='reject'?'Confirmar rejeição':'Enviar pedido de ajustes'}</button><button className="secondary" type="button" onClick={()=>{setReviewDecision(null);setReviewNote('');}}>Cancelar</button></div>
  </form>}
 </div>)}</section>}
 {tab==='admin'&&<div className="columns"><section className="panel"><h2>Cadastrar colaborador</h2><form onSubmit={createUser}><label>E-mail<input required type="email" value={newEmail} onChange={e=>setNewEmail(e.target.value)}/></label><label>Perfil<select value={newRole} onChange={e=>setNewRole(e.target.value as typeof newRole)}><option value="USER">Colaborador</option><option value="APPROVER">Aprovador de conhecimento</option><option value="ADMIN">Administrador</option></select></label><button>Criar usuário</button></form>{temporary&&<div className="pending"><strong>Código temporário (visível apenas agora)</strong><code>{temporary}</code><p className="hint">Entregue ao usuário por canal seguro. Válido por 15 minutos.</p><button className="secondary" onClick={()=>{void navigator.clipboard.writeText(temporary);}}>Copiar</button></div>}</section><section className="panel"><h2>Usuários</h2>{users.map(u=><div className="item user-item" key={u.id}><span>{u.email}<small>{u.active?'Ativo':'Inativo'} · {u.role}</small></span><button className="secondary" onClick={()=>resetUser(u.id)} disabled={u.id===user.id}><RotateCcw size={14}/> Redefinir</button><select aria-label={'Perfil de '+u.email} value={u.role} disabled={u.id===user.id} onChange={e=>void updateUser(u.id,{role:e.target.value as 'USER'|'APPROVER'|'ADMIN'})}><option value="USER">Colaborador</option><option value="APPROVER">Aprovador</option><option value="ADMIN">Administrador</option></select><button className="secondary" disabled={u.id===user.id} onClick={()=>{if(u.active&&!window.confirm('Desativar '+u.email+' e invalidar as sessões existentes?'))return;void updateUser(u.id,{active:!u.active});}}>{u.active?'Desativar':'Ativar'}</button><select aria-label={'Conceder acesso a '+u.email} defaultValue="" onChange={e=>{if(e.target.value){const [space,mode]=e.target.value.split('|');void grant(u.id,space,mode);}e.target.value='';}}><option value="">Alterar acesso restrito...</option>{spaces.filter(s=>s.visibility==='RESTRICTED').flatMap(s=>([['READ','Somente leitura'],['EDIT','Leitura e edição'],['APPROVE','Leitura, edição e aprovação'],['NONE','Revogar acesso']] as const).map(([mode,label])=><option key={s.id+mode} value={s.id+'|'+mode}>{s.name} — {label}</option>))}</select></div>)}</section></div>}
 </main></div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
