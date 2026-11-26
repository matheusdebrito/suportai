import React,{useEffect,useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {BrainCircuit,MessageCircle,BookOpen,ShieldCheck,Users,Send,Plus,LogOut,FileUp,Check,RotateCcw,LoaderCircle,ThumbsUp,ThumbsDown,Trash2,Menu,X,Settings,Search} from 'lucide-react';
import './styles.css';
type User={id:string;email:string;role:'ADMIN'|'APPROVER'|'USER';mustChangePassword:boolean};
type Operations={
 observedAt:string;externalAiEnabled:boolean;
 ingestion:{pending:number;running:number;completed:number;failed:number;stalled:number;last_completed_at:string|null};
 knowledge:{published:number;archived:number};
 conversation:{answers_7d:number;questions_7d:number};
 feedback:{good_7d:number;bad_7d:number};
};
type Space={id:string;name:string;visibility:string;can_read:boolean;can_edit:boolean;can_approve:boolean};
type Department={id:string;name:string;active:boolean;members:number};
type AdminUser={id:string;email:string;role:string;active:boolean;department_ids:string[]};
type Doc={id:string;title:string;kind:string;space_name:string};
type Message={id?:string;role:'user'|'assistant';content:string;sources?:{documentId:string;versionId:string;versionNumber?:number;title:string;historical?:boolean;excerpts?:string[];hasOperationalCredentials?:boolean}[];feedback_rating?:'GOOD'|'BAD'|null;feedback_comment?:string|null};
type Pending={id:string;title:string;content:string;spaceName?:string;documentId?:string;beforeContent?:string};
type SimilarArticle={id:string;title:string;kind:'ARTICLE'|'PDF'};
type DuplicatePrompt={source:'panel'|'pending';matches:SimilarArticle[];title:string;spaceId?:string;content?:string;pendingId?:string};
type DuplicateResponseError=Error&{code?:string;matches?:SimilarArticle[]};
type Conversation={id:string;title:string;updated_at:string};
type Draft={version_id:string;document_id:string;title:string;kind:'ARTICLE'|'PDF';version_number:number;status:'DRAFT'|'IN_REVIEW'|'CHANGES_REQUESTED'|'REJECTED';index_status:'READY'|'PENDING'|'FAILED';space_name:string;ingestion_error?:string;review_note?:string};
type DraftDetail=Draft&{content:string;space_id:string};
type DocDetail={id:string;title:string;kind:'ARTICLE'|'PDF';space_id:string;isCurrent?:boolean;operationalCredentials?:string[];version:{id:string;content:string;version_number:number;status:string}};
type Editing={documentId:string;baseVersionId:string};
type PdfTarget={kind:'revision'|'correction';id:string;baseVersionId?:string;title:string};
type Review={version_id:string;document_id:string;title:string;space_name:string;status:string;index_status:string;content:string;base_content?:string|null;ingestion_error?:string};
type ArchivedDoc={id:string;title:string;kind:'ARTICLE'|'PDF';space_name:string;archived_at:string;current_version_id:string};
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
 const headers=new Headers(init.headers);
 // Empty POSTs (logout, new conversation, submit for review) must have no
 // JSON content type, otherwise Fastify rejects an absent request body.
 if(typeof init.body==='string'&&!headers.has('Content-Type'))
   headers.set('Content-Type','application/json');
 const response=await fetch(path,{...init,credentials:'include',headers});
 const result=await response.json().catch(()=>({error:'Resposta inválida do servidor'}));
 if(!response.ok) throw Object.assign(new Error(result.error||'Falha na operação'),
   {code:typeof result.code==='string'?result.code:undefined,
    matches:Array.isArray(result.matches)?result.matches:undefined});
 return result;
}
// Reuse the authorized document endpoint; never store the returned password in a chat message.
function OperationalCredentialPreview({documentId,versionId}:{documentId:string;versionId:string}){
 const [lines,setLines]=useState<string[]|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const generation=useRef(0);
 useEffect(()=>()=>{generation.current++;},[]);
 useEffect(()=>{if(!lines)return;const timer=window.setTimeout(()=>setLines(null),30000);return()=>window.clearTimeout(timer);},[lines]);
 async function show(){
  const current=++generation.current;setLoading(true);setError('');
  try{
   const result=await api<DocDetail>(`/knowledge/documents/${documentId}/versions/${versionId}`,{cache:'no-store'});
   if(current!==generation.current)return;
   if(result.operationalCredentials?.length)setLines(result.operationalCredentials);
   else setError('A credencial não está disponível na versão vigente.');
  }catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'Acesso indisponível');}
  finally{if(current===generation.current)setLoading(false);}
 }
 return <div className="operational-preview">
  <button type="button" className="secondary" disabled={loading} onClick={()=>lines?setLines(null):void show()}>{loading?'Consultando...':lines?'Ocultar credenciais':'Ver credenciais do procedimento'}</button>
  {lines&&<div className="formatted pending">{lines.join('\n')}</div>}
  {error&&<p className="hint" role="status">{error}</p>}
 </div>;
}
function App(){
 const [user,setUser]=useState<User|null>(null);
 const [loading,setLoading]=useState(true);
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [resetToken,setResetToken]=useState('');
 const [showReset,setShowReset]=useState(false);
 const [newPassword,setNewPassword]=useState('');
 const [tab,setTab]=useState<'chat'|'knowledge'|'reviews'|'admin'|'settings'>('chat');
 const [sidebarOpen,setSidebarOpen]=useState(false);
 const [userSearch,setUserSearch]=useState('');
 const [spaces,setSpaces]=useState<Space[]>([]);
 const [docs,setDocs]=useState<Doc[]>([]);
 const [messages,setMessages]=useState<Message[]>([]);
 const [feedbackEditor,setFeedbackEditor]=useState<{messageId:string;rating:'GOOD'|'BAD';comment:string}|null>(null);
 const [feedbackSaving,setFeedbackSaving]=useState<string|null>(null);
 const [conversations,setConversations]=useState<Conversation[]>([]);
 const [conversationLoading,setConversationLoading]=useState(false);
 const [conversationId,setConversationId]=useState<string|null>(null);
 const [input,setInput]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [pending,setPending]=useState<Pending[]>([]);
 const [review,setReview]=useState<Review[]>([]);
 const [archived,setArchived]=useState<ArchivedDoc[]>([]);
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
 const [pdfTarget,setPdfTarget]=useState<PdfTarget|null>(null);
 const [correctionOf,setCorrectionOf]=useState<string|null>(null);
 const [reviewDecision,setReviewDecision]=useState<{id:string;action:'reject'|'request-changes'}|null>(null);
 const [reviewNote,setReviewNote]=useState('');
 const [users,setUsers]=useState<AdminUser[]>([]);
 const [departments,setDepartments]=useState<Department[]>([]);
 const [departmentName,setDepartmentName]=useState('');
 const [editingDepartment,setEditingDepartment]=useState<{id:string;name:string}|null>(null);
 const [operations,setOperations]=useState<Operations|null>(null);
 const [newEmail,setNewEmail]=useState('');
 const [newRole,setNewRole]=useState<'USER'|'APPROVER'|'ADMIN'>('USER');
 const [temporary,setTemporary]=useState('');
 useEffect(()=>{if(!sidebarOpen)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setSidebarOpen(false);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[sidebarOpen]);
 useEffect(()=>{api<User>('/auth/me').then(setUser).catch(()=>{}).finally(()=>setLoading(false));},[]);
 useEffect(()=>{if(!user||user.mustChangePassword)return;void refresh().catch(failed);void refreshConversations().catch(failed);},[user]);
 async function refresh(){
  const [s,d,mine]=await Promise.all([api<{spaces:Space[]}>('/spaces'),api<{documents:Doc[]}>('/knowledge/documents'),api<{drafts:Draft[]}>('/knowledge/mine')]);
  setSpaces(s.spaces);setDocs(d.documents);setDrafts(mine.drafts);setSpaceId(prev=>prev||s.spaces.find(x=>x.can_edit)?.id||'');
  if((user?.role==='APPROVER'||user?.role==='ADMIN')){
   const [reviews,hidden]=await Promise.all([api<{reviews:Review[]}>('/knowledge/reviews'),api<{documents:ArchivedDoc[]}>('/knowledge/archived')]);
   setReview(reviews.reviews);setArchived(hidden.documents);
  }
  if(user?.role==='ADMIN'){
   const [accounts,health,departmentsResponse]=await Promise.all([
     api<{users:AdminUser[]}>('/admin/users'),api<Operations>('/admin/operations'),
     api<{departments:Department[]}>('/admin/departments')
   ]);
   setUsers(accounts.users);setOperations(health);setDepartments(departmentsResponse.departments);
  }
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

 async function createDepartment(event:React.FormEvent){
   event.preventDefault();setError('');
   try{
     await api('/admin/departments',{method:'POST',body:JSON.stringify({name:departmentName})});
     setDepartmentName('');await refresh();
   }catch(error){failed(error);}
 }
 async function updateDepartment(id:string,updates:{name?:string;active?:boolean}){
   setError('');
   try{
     await api('/admin/departments/'+id,{method:'PATCH',body:JSON.stringify(updates)});
     setEditingDepartment(null);await refresh();
   }catch(error){failed(error);}
 }
 async function assignDepartments(userId:string,departmentIds:string[]){
   setError('');
   try{
     await api('/admin/users/'+userId+'/departments',{
       method:'PUT',body:JSON.stringify({departmentIds})
     });
     await refresh();
     if(userId===user?.id){setUser(null);setError('Sua sessão foi encerrada após a alteração de departamentos. Entre novamente.');}
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
   setConversationId(id);setMessages(result.messages);setPending(result.pendingActions);setFeedbackEditor(null);
   setInput('');setTab('chat');
  }catch(e){failed(e);}finally{setConversationLoading(false);}
 }
 async function deleteConversation(id:string){
   if(busy||conversationLoading)return;
   if(!window.confirm('Excluir definitivamente esta conversa, as avaliações e as propostas ainda não confirmadas? Artigos criados serão preservados.'))return;
   setError('');
   try{
     await api('/conversations/'+id,{method:'DELETE',body:JSON.stringify({confirm:true})});
     if(conversationId===id){
       setConversationId(null);setMessages([]);setPending([]);setFeedbackEditor(null);
     }
     await refreshConversations();
   }catch(e){failed(e);}
 }
 function newConversation(){
  if(busy||conversationLoading)return;
  setConversationId(null);setMessages([]);setPending([]);setFeedbackEditor(null);setInput('');setError('');setTab('chat');
 }
 async function viewDraft(versionId:string){
  setError('');
  try{setDraftView(await api<DraftDetail>(`/knowledge/drafts/${versionId}`));}
  catch(e){failed(e);}
 }
 function startEditing(){
  if(!selectedDoc||selectedDoc.kind!=='ARTICLE'||selectedDoc.isCurrent===false)return;
  if(!spaces.some(s=>s.id===selectedDoc.space_id&&s.can_edit))return;
  setPdfTarget(null);setCorrectionOf(null);
  setEditing({documentId:selectedDoc.id,baseVersionId:selectedDoc.version.id});
  setTitle(selectedDoc.title);setContent(selectedDoc.version.content);setSpaceId(selectedDoc.space_id);
  setLastDraft(null);
 }
 function startPdfRevision(){
   if(!selectedDoc||selectedDoc.kind!=='PDF'||selectedDoc.isCurrent===false
     ||!spaces.some(s=>s.id===selectedDoc.space_id&&s.can_edit))return;
   setEditing(null);setCorrectionOf(null);setLastDraft(null);
   setSpaceId(selectedDoc.space_id);
   setPdfTarget({kind:'revision',id:selectedDoc.id,baseVersionId:selectedDoc.version.id,title:selectedDoc.title});
 }
 function startPdfCorrection(draft:Draft){
   if(draft.kind!=='PDF'||draft.status!=='CHANGES_REQUESTED')return;
   setEditing(null);setCorrectionOf(null);setLastDraft(null);
   setPdfTarget({kind:'correction',id:draft.version_id,title:draft.title});
 }
 async function startCorrection(versionId:string){
   setError('');
   try{
     const original=await api<DraftDetail>('/knowledge/drafts/'+versionId);
     if(original.status!=='CHANGES_REQUESTED'||original.kind!=='ARTICLE')throw new Error('Este artigo não está disponível para correção');
     setPdfTarget(null);setEditing(null);setCorrectionOf(original.version_id);
     setTitle(original.title);setContent(original.content);setSpaceId(original.space_id);
     setTab('knowledge');setLastDraft(null);
   }catch(e){failed(e);}
 }
 function cancelEditing(){setEditing(null);setCorrectionOf(null);setPdfTarget(null);setTitle('');setContent('');setLastDraft(null);}

 async function login(e:React.FormEvent){e.preventDefault();setError('');try{const r=await api<{user:User}>('/auth/login',{method:'POST',body:JSON.stringify({email,password})});setPassword('');setUser(r.user);}catch(e){failed(e);}}
 async function changePassword(e:React.FormEvent){e.preventDefault();setError('');try{await api('/auth/change-password',{method:'POST',body:JSON.stringify({resetToken,newPassword})});const u=await api<User>('/auth/me');setUser(u);setResetToken('');setNewPassword('');setShowReset(false);}catch(e){failed(e);}}
 async function logout(){try{await api('/auth/logout',{method:'POST'});window.location.reload();}catch(error){failed(error);}}
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
 async function rateMessage(messageId:string,rating:'GOOD'|'BAD',comment?:string){
   if(feedbackSaving)return;
   setFeedbackSaving(messageId);setError('');
   try{
     const saved=await api<{ok:true;rating:'GOOD'|'BAD';comment:string|null}>('/feedback',{
       method:'POST',body:JSON.stringify({messageId,rating,comment:comment??null})
     });
     setMessages(current=>current.map(m=>m.id===messageId?{
       ...m,feedback_rating:saved.rating,feedback_comment:saved.comment
     }:m));
     setFeedbackEditor(null);
   }catch(e){failed(e);}finally{setFeedbackSaving(null);}
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
   try{
     const form=new FormData();
     if(pdfTarget?.kind==='revision')form.append('baseVersionId',pdfTarget.baseVersionId||'');
     else if(!pdfTarget)form.append('spaceId',spaceId);
     form.append('file',file);
     const url=!pdfTarget?'/knowledge/pdfs':pdfTarget.kind==='revision'
       ? '/knowledge/documents/'+pdfTarget.id+'/pdf-versions'
       : '/knowledge/versions/'+pdfTarget.id+'/correct-pdf';
     const result=await api<{versionId:string}>(url,{method:'POST',body:form});
     setPdfTarget(null);setLastDraft(result.versionId);
     await refresh();
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
 async function archiveDoc(id:string){
   if(!window.confirm('Arquivar este documento? Ele deixará de aparecer no cérebro e nas buscas oficiais.'))return;
   setError('');
   try{await api('/knowledge/documents/'+id+'/archive',{method:'POST',body:JSON.stringify({confirm:true})});setSelectedDoc(null);await refresh();}
   catch(e){failed(e);}
 }
 async function restoreDoc(id:string){
   if(!window.confirm('Restaurar a versão aprovada deste documento ao cérebro?'))return;
   setError('');
   try{await api('/knowledge/documents/'+id+'/restore',{method:'POST',body:JSON.stringify({confirm:true})});await refresh();}
   catch(e){failed(e);}
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
 return <div className={"app "+(tab==='chat'?'chat-page':'')}><button type="button" aria-label="Fechar menu" className={"sidebar-backdrop "+(sidebarOpen?'open':'')} onClick={()=>setSidebarOpen(false)}/><aside id="app-sidebar" className={"sidebar "+(sidebarOpen?'open':'')}><div className="sidebar-brand"><div className="logo"><BrainCircuit/> SuportAI</div><button type="button" className="sidebar-close" aria-label="Fechar navegação" onClick={()=>setSidebarOpen(false)}><X size={20}/></button></div><button className="new-chat" disabled={busy||conversationLoading} onClick={()=>{newConversation();setSidebarOpen(false);}}><Plus size={18}/> Nova conversa</button><nav aria-label="Navegação principal">
  <button className={tab==='chat'?'active':''} onClick={()=>{setTab('chat');setSidebarOpen(false);}}><MessageCircle size={18}/> Assistente</button>
  <button className={tab==='knowledge'?'active':''} onClick={()=>{setTab('knowledge');setSidebarOpen(false);}}><BookOpen size={18}/> Conhecimento</button>
  {(user.role==='APPROVER'||user.role==='ADMIN')&&<button className={tab==='reviews'?'active':''} onClick={()=>{setTab('reviews');setSidebarOpen(false);void refresh().catch(failed);}}><ShieldCheck size={18}/> Revisão</button>}
  {user.role==='ADMIN'&&<button className={tab==='admin'?'active':''} onClick={()=>{setTab('admin');setSidebarOpen(false);}}><Users size={18}/> Usuários</button>}
  {user.role==='ADMIN'&&<button className={tab==='settings'?'active':''} onClick={()=>{setTab('settings');setSidebarOpen(false);}}><Settings size={18}/> Configurações</button>}</nav><aside className="conversations-panel"><div className="conversations-heading"><strong>Conversas</strong><button className="secondary" disabled={busy||conversationLoading} onClick={()=>void refreshConversations().catch(failed)} aria-label="Atualizar conversas"><RotateCcw size={15}/></button></div>{conversations.length===0?<p className="hint">Suas conversas aparecem aqui depois da primeira mensagem.</p>:conversations.map(c=><div className="conversation-row" key={c.id}><button disabled={busy||conversationLoading} className={'conversation-item '+(conversationId===c.id?'selected':'')} onClick={()=>{setSidebarOpen(false);void openConversation(c.id);}}><span>{c.title}</span><small>{new Date(c.updated_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</small></button><button type="button" className="conversation-remove" disabled={busy||conversationLoading} aria-label={'Excluir conversa '+c.title} title="Excluir conversa" onClick={()=>void deleteConversation(c.id)}><Trash2 size={15}/></button></div>)}</aside><div className="sidebar-footer"><div className="identity">{user.email}<small>{user.role==='ADMIN'?'Administrador':user.role==='APPROVER'?'Aprovador de conhecimento':'Colaborador'}</small></div><button onClick={logout}><LogOut size={17}/> Sair</button></div></aside>
 <main className="main"><header><button type="button" className="mobile-menu-btn" aria-label="Abrir menu" aria-expanded={sidebarOpen} aria-controls="app-sidebar" onClick={()=>setSidebarOpen(true)}><Menu size={22}/></button><div><strong>{tab==='chat'?'Assistente':tab==='knowledge'?'Base de conhecimento':tab==='reviews'?'Central de revisão':tab==='admin'?'Gerenciar usuários':'Configurações'}</strong><p>{tab==='chat'?'Pergunte, investigue e registre soluções com segurança.':'Conhecimento revisado, rastreável e acessível.'}</p></div></header>
 {error&&<div className="error" role="alert">{error}<button className="ghost" onClick={()=>setError('')}>Fechar</button></div>}
 {duplicatePrompt&&<section className="panel duplicate-panel" aria-label="Possíveis artigos duplicados">
  <h3>Encontramos artigos semelhantes a “{duplicatePrompt.title}”</h3>
  <p className="hint">Evite criar um procedimento duplicado. Você pode abrir o conteúdo existente e propor uma atualização, ou justificar a criação de um artigo diferente.</p>
  <div className="duplicates-list">{duplicatePrompt.matches.map(match=><div key={match.id} className="duplicate-item"><span><BookOpen size={16}/>{match.title}</span><button className="secondary" onClick={()=>{void openDoc(match.id);setDuplicatePrompt(null);}}>Abrir artigo</button></div>)}</div>
  <form onSubmit={continueDuplicate}>
    <label>Por que é necessário criar outro artigo?
      <textarea required minLength={15} maxLength={500} rows={2} value={duplicateReason}
        onChange={e=>setDuplicateReason(e.target.value)} placeholder="Explique a diferença do novo procedimento..."/>
    </label>
    <div className="actions"><button>Criar novo artigo com justificativa</button>
      <button type="button" className="secondary" onClick={()=>{setDuplicatePrompt(null);setDuplicateReason('');}}>Cancelar</button>
    </div>
  </form>
 </section>}
 {tab==='chat'&&<div className="chat-layout"><section className="chat"><div className="chat-history">{conversationLoading&&<p className="hint"><LoaderCircle className="spin" size={16}/> Abrindo conversa...</p>}{messages.length===0&&<div className="empty"><BrainCircuit size={40}/><h2>Como posso ajudar?</h2><p>Consulte procedimentos, investigue problemas ou peça para preparar um artigo no cérebro.</p><div className="suggestions">{['Como consultar procedimentos de rede?','Como registrar um procedimento novo?','O que fazer quando um servidor não responde?'].map(x=><button key={x} onClick={()=>setInput(x)}>{x}</button>)}</div></div>}
  {messages.map((m,i)=><div className={'bubble '+m.role} key={m.id||i}><div className="bubble-role">{m.role==='user'?'Você':'SuportAI'}</div><div className="formatted">{m.content}</div>{Boolean(m.sources?.length)&&<div className="sources"><strong>Fontes consultadas</strong>{m.sources!.some(s=>s.hasOperationalCredentials)&&<p className="hint">O procedimento contém credenciais operacionais disponíveis com sua autorização atual.</p>}{m.sources!.map((s,j)=><button key={j} onClick={()=>openSource(s.documentId,s.versionId)} title={s.excerpts?.join('\n')}>{s.excerpts?.length?`[${j+1}] `:''}{s.title}{s.hasOperationalCredentials?' · credenciais disponíveis':''} · versão {s.versionNumber??s.versionId.slice(0,8)}{s.historical?' · histórica':''}</button>)}{m.sources!.filter((s,i,all)=>s.hasOperationalCredentials&&!s.historical&&all.findIndex(x=>x.documentId===s.documentId&&x.versionId===s.versionId&&x.hasOperationalCredentials)===i).map(s=><OperationalCredentialPreview key={s.versionId} documentId={s.documentId} versionId={s.versionId}/>)}</div>}
 {m.role==='assistant'&&m.id&&<div className="feedback-area">
  <div className="feedback-controls"><span className="hint">Esta resposta ajudou?</span>
   <button type="button" aria-label="Resposta útil" title="Resposta útil" aria-pressed={m.feedback_rating==='GOOD'} disabled={feedbackSaving===m.id} className={m.feedback_rating==='GOOD'?'feedback-selected':''} onClick={()=>void rateMessage(m.id!,'GOOD')}><ThumbsUp size={16}/></button>
   <button type="button" aria-label="Resposta não útil" title="Resposta não útil" aria-pressed={m.feedback_rating==='BAD'} disabled={feedbackSaving===m.id} className={m.feedback_rating==='BAD'?'feedback-selected':''} onClick={()=>void rateMessage(m.id!,'BAD')}><ThumbsDown size={16}/></button>
   {m.feedback_rating&&<button type="button" className="feedback-comment-action" onClick={()=>setFeedbackEditor({messageId:m.id!,rating:m.feedback_rating!,comment:m.feedback_comment||''})}>{m.feedback_comment?'Editar comentário':'Adicionar comentário'}</button>}
  </div>
  {feedbackEditor?.messageId===m.id&&<form className="feedback-editor" onSubmit={e=>{e.preventDefault();void rateMessage(m.id!,feedbackEditor.rating,feedbackEditor.comment);}}>
   <label>Conte por que esta resposta foi útil ou não
    <textarea rows={3} maxLength={1000} value={feedbackEditor.comment} onChange={e=>setFeedbackEditor(old=>old?{...old,comment:e.target.value}:old)} placeholder="Comentário opcional, sem senhas ou tokens"/>
   </label>
   <div className="actions"><button type="submit" disabled={feedbackSaving===m.id}>Salvar avaliação</button><button className="secondary" type="button" onClick={()=>setFeedbackEditor(null)}>Cancelar</button></div>
  </form>}
 </div>}
 </div>)}
  {busy&&<p className="hint"><LoaderCircle className="spin" size={16}/> Consultando conhecimento...</p>}
  {pending.map(p=><div className="pending" key={p.id}><strong>Prévia: {p.title}</strong><small>Destino: {p.spaceName||'Espaço autorizado'}</small>{p.documentId?<><p>Atualização de artigo existente — a versão publicada permanecerá intacta até a aprovação.</p><details className="diff-preview"><summary>Ver diferenças entre o artigo publicado e a proposta</summary>{(()=>{
  const changes=textDiff(p.beforeContent||'',p.content);
  return changes.unchanged?<p className="hint">O conteúdo proposto não apresenta diferenças.</p>:<div className="diff-columns"><div><strong>Anterior</strong><pre className="diff-removed">{changes.removed||'Nenhum trecho removido'}</pre></div><div><strong>Proposto</strong><pre className="diff-added">{changes.added||'Nenhum trecho adicionado'}</pre></div></div>;
 })()}</details><button className="secondary" type="button" onClick={()=>void openDoc(p.documentId!)}>Abrir artigo publicado</button></>:<p>{p.content.slice(0,900)}</p>}<button onClick={()=>confirmPending(p.id)}><Check size={16}/> {p.documentId?'Confirmar proposta de atualização':'Confirmar criação de rascunho'}</button></div>)}
  </div><form className="composer" onSubmit={send}><textarea placeholder="Digite sua pergunta..." value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send(e as unknown as React.FormEvent);}}}/><button disabled={busy||conversationLoading||!input.trim()} aria-label="Enviar mensagem"><Send size={19}/></button></form></section></div>}
 {tab==='knowledge'&&<div className="columns"><section className="panel"><h2>Artigos e documentos publicados</h2>{docs.length===0?<p className="hint">Nenhum documento publicado ainda.</p>:docs.map(d=><button className="item" key={d.id} onClick={()=>openDoc(d.id)}><BookOpen size={17}/><span>{d.title}<small>{d.space_name} · {d.kind}</small></span></button>)}
 {selectedDoc&&<article className="document"><h3>{selectedDoc.title}</h3><small>Versão {selectedDoc.version.version_number}</small><div className="formatted">{selectedDoc.version.content}</div>{selectedDoc.kind==='ARTICLE'&&selectedDoc.isCurrent!==false&&spaces.some(s=>s.id===selectedDoc.space_id&&s.can_edit)&&<button className="secondary" onClick={startEditing}>Criar revisão deste artigo</button>}{selectedDoc.kind==='PDF'&&selectedDoc.isCurrent!==false&&spaces.some(s=>s.id===selectedDoc.space_id&&s.can_edit)&&<button className="secondary" onClick={startPdfRevision}>Enviar nova versão deste PDF</button>}{(user.role==='APPROVER'||user.role==='ADMIN')&&selectedDoc.isCurrent!==false&&spaces.some(s=>s.id===selectedDoc.space_id&&s.can_approve)&&<button className="danger" onClick={()=>void archiveDoc(selectedDoc.id)}>Arquivar documento</button>}</article>}
  <div className="drafts-header"><h2>Meus rascunhos</h2><button className="secondary" onClick={()=>void refresh().catch(failed)}><RotateCcw size={14}/> Atualizar</button></div>
  {drafts.length===0?<p className="hint">Nenhum rascunho ou revisão pendente.</p>:drafts.map(d=><div className="draft-item" key={d.version_id}><strong>{d.title}</strong><small>{d.space_name} · v{d.version_number} · {d.status==='DRAFT'?'Rascunho':d.status==='IN_REVIEW'?'Em revisão':d.status==='CHANGES_REQUESTED'?'Ajustes solicitados':'Rejeitado'} · Índice: {d.index_status}</small>{d.ingestion_error&&<p className="error">{d.ingestion_error}</p>}{d.review_note&&<p className="review-note"><strong>Parecer:</strong> {d.review_note}</p>}<div className="actions"><button className="secondary" onClick={()=>void viewDraft(d.version_id)}>Ver texto</button>{d.status==='DRAFT'&&d.index_status==='READY'&&<button className="secondary" onClick={()=>void submitVersion(d.version_id)}>Enviar para revisão</button>}{d.status==='CHANGES_REQUESTED'&&d.kind==='ARTICLE'&&<button className="secondary" onClick={()=>void startCorrection(d.version_id)}>Preparar correção</button>}{d.status==='CHANGES_REQUESTED'&&d.kind==='PDF'&&<button className="secondary" onClick={()=>startPdfCorrection(d)}>Enviar PDF corrigido</button>}{d.index_status==='FAILED'&&d.status!=='REJECTED'&&d.status!=='CHANGES_REQUESTED'&&<button className="secondary" onClick={()=>void retryVersion(d.version_id)}>Reprocessar</button>}</div></div>)}
  {draftView&&<article className="document"><div className="drafts-header"><h3>{draftView.title} · v{draftView.version_number}</h3><button className="ghost" onClick={()=>setDraftView(null)}>Fechar</button></div><small>{draftView.status}</small><div className="formatted">{draftView.content||'Aguardando extração do PDF.'}</div></article>}
  </section><section className="panel"><h2>{pdfTarget?'Enviar versão de PDF':correctionOf?'Corrigir proposta':editing?'Propor atualização':'Adicionar conhecimento'}</h2><p className="hint">{pdfTarget?'O novo arquivo será processado como rascunho. O PDF publicado continuará disponível até a aprovação.':correctionOf?'A correção será uma nova versão em rascunho.':editing?'A revisão só substituirá o artigo publicado após aprovação.':'Crie um artigo ou importe um PDF. O conteúdo só ficará público após revisão.'}</p>
 {editable.length===0?<p>Você não possui permissão de edição.</p>:<><label>Espaço<select value={spaceId} disabled={Boolean(editing||correctionOf||pdfTarget)} onChange={e=>setSpaceId(e.target.value)}>{editable.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
 {!pdfTarget&&<form onSubmit={saveArticle}>{spaces.find(s=>s.id===spaceId)?.visibility==='RESTRICTED'&&<p className="hint">Se necessário, inclua em linha própria: Senha operacional: valor. Somente leitores autorizados deste espaço terão acesso; o modelo recebe uma referência mascarada.</p>}<label>Título<input required minLength={3} value={title} readOnly={Boolean(editing||correctionOf)} onChange={e=>setTitle(e.target.value)}/></label><label>Procedimento<textarea required minLength={20} value={content} onChange={e=>setContent(e.target.value)} rows={7}/></label><button><Plus size={17}/> {correctionOf?'Salvar correção em novo rascunho':editing?'Salvar proposta de revisão':'Criar rascunho'}</button>{(editing||correctionOf)&&<button type="button" className="secondary" onClick={cancelEditing}>Cancelar edição</button>}</form>}
 {editing&&<details className="diff-preview"><summary>Comparar alterações com a versão publicada</summary>{(()=>{
   const changes=textDiff(selectedDoc?.version.content||'',content);
   return changes.unchanged?<p className="hint">Nenhuma mudança detectada.</p>:<div className="diff-columns"><div><strong>Removido</strong><pre className="diff-removed">{changes.removed||'Nenhum trecho removido'}</pre></div><div><strong>Adicionado</strong><pre className="diff-added">{changes.added||'Nenhum trecho adicionado'}</pre></div></div>;
 })()}</details>}
 {!editing&&!correctionOf&&<><label className="upload"><FileUp size={19}/> {pdfTarget?`Selecionar arquivo corrigido: ${pdfTarget.title}`:'Enviar PDF'}<input type="file" accept="application/pdf,.pdf" onChange={uploadPdf}/></label>{pdfTarget&&<button type="button" className="secondary" onClick={()=>setPdfTarget(null)}>Cancelar envio</button>}</>}
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
 </div>)}<div className="drafts-header"><h2>Documentos arquivados</h2><button className="secondary" onClick={()=>void refresh().catch(failed)}><RotateCcw size={14}/> Atualizar</button></div>
 {archived.length===0?<p className="hint">Nenhum documento arquivado em seus espaços de aprovação.</p>:archived.map(item=><div className="draft-item" key={item.id}>
  <strong>{item.title}</strong><small>{item.space_name} · {item.kind} · Arquivado em {new Date(item.archived_at).toLocaleDateString('pt-BR')}</small>
  <button className="secondary" onClick={()=>void restoreDoc(item.id)}>Restaurar versão publicada</button>
 </div>)}
 </section>}
 {tab==='admin'&&user.role==='ADMIN'&&<div className="columns user-management"><section className="panel"><h2>Cadastrar colaborador</h2><form onSubmit={createUser}><label>E-mail<input required type="email" value={newEmail} onChange={e=>setNewEmail(e.target.value)}/></label><label>Perfil<select value={newRole} onChange={e=>setNewRole(e.target.value as typeof newRole)}><option value="USER">Colaborador</option><option value="APPROVER">Aprovador de conhecimento</option><option value="ADMIN">Administrador</option></select></label><button>Criar usuário</button></form>{temporary&&<div className="pending"><strong>Código temporário (visível apenas agora)</strong><code>{temporary}</code><p className="hint">Entregue ao usuário por canal seguro. Válido por 15 minutos.</p><button className="secondary" onClick={()=>{void navigator.clipboard.writeText(temporary);}}>Copiar</button></div>}</section><section className="panel users-list"><h2>Usuários</h2><label className="user-search"><Search size={16}/> Buscar usuário<input type="search" placeholder="Buscar por e-mail ou perfil" value={userSearch} onChange={e=>setUserSearch(e.target.value)}/></label>{users.filter(u=>(u.email+" "+u.role).toLowerCase().includes(userSearch.trim().toLowerCase())).length===0&&<p className="hint">Nenhum usuário encontrado.</p>}{users.filter(u=>(u.email+" "+u.role).toLowerCase().includes(userSearch.trim().toLowerCase())).map(u=><div className="item user-item" key={u.id}><span>{u.email}<small>{u.active?'Ativo':'Inativo'} · {u.role}</small></span><button className="secondary" onClick={()=>resetUser(u.id)} disabled={u.id===user.id}><RotateCcw size={14}/> Redefinir</button><select aria-label={'Perfil de '+u.email} value={u.role} disabled={u.id===user.id} onChange={e=>void updateUser(u.id,{role:e.target.value as 'USER'|'APPROVER'|'ADMIN'})}><option value="USER">Colaborador</option><option value="APPROVER">Aprovador</option><option value="ADMIN">Administrador</option></select><button className="secondary" disabled={u.id===user.id} onClick={()=>{if(u.active&&!window.confirm('Desativar '+u.email+' e invalidar as sessões existentes?'))return;void updateUser(u.id,{active:!u.active});}}>{u.active?'Desativar':'Ativar'}</button><label>Departamentos (Ctrl/Shift para múltiplos)
 <select multiple size={Math.min(4,Math.max(2,departments.filter(d=>d.active).length))}
   aria-label={'Departamentos de '+u.email} value={u.department_ids||[]}
   onChange={e=>void assignDepartments(u.id,Array.from(e.currentTarget.selectedOptions).map(option=>option.value))}>
   {departments.filter(d=>d.active||(u.department_ids||[]).includes(d.id))
     .map(d=><option key={d.id} value={d.id}>{d.name}{d.active?'':' (inativo)'}</option>)}
 </select></label>
 <select aria-label={'Conceder acesso a '+u.email} defaultValue="" onChange={e=>{if(e.target.value){const [space,mode]=e.target.value.split('|');void grant(u.id,space,mode);}e.target.value='';}}><option value="">Alterar permissões do conhecimento...</option>{spaces.flatMap(s=>([['READ','Somente leitura'],['EDIT','Leitura e edição'],['APPROVE','Leitura, edição e aprovação'],['NONE','Revogar acesso']] as const).map(([mode,label])=><option key={s.id+mode} value={s.id+'|'+mode}>{s.name} — {label}</option>))}</select></div>)}</section></div>}
 {tab==='settings'&&user.role==='ADMIN'&&<div className="columns"><section className="panel"><h2>Departamentos</h2>
 <p className="hint">O vínculo com um departamento não concede acesso a conteúdo restrito.</p>
 <form onSubmit={createDepartment}><label>Nome do departamento
 <input minLength={3} maxLength={80} required value={departmentName}
   onChange={e=>setDepartmentName(e.target.value)}/></label><button>Criar departamento</button></form>
 {departments.map(d=><div className="item" key={d.id}>
   {editingDepartment?.id===d.id?
     <form onSubmit={e=>{e.preventDefault();void updateDepartment(d.id,{name:editingDepartment.name});}}>
       <input aria-label={'Renomear departamento '+d.name} required minLength={3} maxLength={80}
         value={editingDepartment.name}
         onChange={e=>setEditingDepartment({id:d.id,name:e.target.value})}/>
       <button>Salvar</button><button type="button" className="secondary" onClick={()=>setEditingDepartment(null)}>Cancelar</button>
     </form>:
     <span>{d.name}<small>{d.members} colaborador(es) · {d.active?'Ativo':'Inativo'}</small></span>}
   <button className="secondary" type="button" onClick={()=>setEditingDepartment({id:d.id,name:d.name})}>Editar</button>
   <button className="secondary" type="button" onClick={()=>void updateDepartment(d.id,{active:!d.active})}>
     {d.active?'Desativar':'Ativar'}
   </button>
 </div>)}
 </section><section className="panel"><div className="drafts-header"><h2>Operação do SuportAI</h2><button className="secondary" onClick={()=>void refresh().catch(failed)}><RotateCcw size={14}/> Atualizar</button></div>
 {operations?<><div className="ops-grid">
  <div><strong>{operations.knowledge.published}</strong><small>Documentos publicados</small></div>
  <div><strong>{operations.knowledge.archived}</strong><small>Arquivados</small></div>
  <div><strong>{operations.ingestion.pending}</strong><small>Na fila</small></div>
  <div><strong>{operations.ingestion.running}</strong><small>Processando</small></div>
  <div><strong>{operations.ingestion.failed}</strong><small>Falhas registradas</small></div>
  <div><strong>{operations.ingestion.stalled}</strong><small>Processamentos atrasados</small></div>
  <div><strong>{operations.conversation.questions_7d}</strong><small>Perguntas (7 dias)</small></div>
  <div><strong>{operations.conversation.answers_7d}</strong><small>Respostas (7 dias)</small></div>
  <div><strong>{operations.feedback.good_7d}</strong><small>Úteis (7 dias)</small></div>
  <div><strong>{operations.feedback.bad_7d}</strong><small>Não úteis (7 dias)</small></div>
 </div>
 <p className="hint">IA externa: {operations.externalAiEnabled?'Habilitada por configuração':'Desabilitada'} · Último processamento: {operations.ingestion.last_completed_at?new Date(operations.ingestion.last_completed_at).toLocaleString('pt-BR'):'Nenhum'} · Atualizado: {new Date(operations.observedAt).toLocaleString('pt-BR')}</p>
 <p className="hint">Indicadores agregados, sem conteúdo de conversas ou documentos. Não substitui logs, alertas nem avaliação de qualidade com modelo real.</p></>:<p className="hint">Carregando indicadores operacionais...</p>}
 </section></div>}
 </main></div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
