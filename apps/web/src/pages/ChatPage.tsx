import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useConversations, useChatActions } from '../hooks/useConversations';
import { useSpaces } from '../hooks/useSpaces';
import { useKnowledge } from '../hooks/useKnowledge';
import { ConversationList } from '../components/chat/ConversationList';
import { ChatArea } from '../components/chat/ChatArea';
import { PendingActions } from '../components/knowledge/PendingActions';
import { DuplicatePrompt } from '../components/knowledge/DuplicatePrompt';
import { Button } from '../components/ui/Button';
import { Loader } from '../components/ui/Loader';
import { Plus, RotateCcw } from 'lucide-react';
import type { Message, PendingAction, SimilarArticle, Conversation } from '../types';

export function ChatPage() {
  const { user } = useAuth();
  const { conversations, loading: conversationsLoading, fetchConversations } = useConversations();
  const { fetchConversation } = useConversations();
  const { sendMessage, createConversation, deleteConversation, rateMessage } = useChatActions();
  const { spaces, fetchSpaces, getEditableSpaces } = useSpaces();
  const { drafts, fetchDrafts, confirmPending, createArticle, correctArticle, correctPdf } = useKnowledge();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedbackEditor, setFeedbackEditor] = useState<{ messageId: string; rating: 'GOOD' | 'BAD'; comment: string } | null>(null);
  const [feedbackSaving, setFeedbackSaving] = useState<string | null>(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState<{ source: 'panel' | 'pending'; matches: SimilarArticle[]; title: string; spaceId?: string; content?: string; pendingId?: string } | null>(null);
  const [duplicateReason, setDuplicateReason] = useState('');
  const [lastDraft, setLastDraft] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    fetchConversations();
    fetchSpaces();
    fetchDrafts();
  }, [fetchConversations, fetchSpaces, fetchDrafts]);

  useEffect(() => {
    if (conversationId) {
      setConversationLoading(true);
      fetchConversation(conversationId).then((data) => {
        if (data) {
          setMessages(data.messages);
          setPending(data.pendingActions);
          setFeedbackEditor(null);
          setInput('');
        }
      }).catch((e) => setError(e.message)).finally(() => setConversationLoading(false));
    }
  }, [conversationId, fetchConversation]);

  const handleNewConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setPending([]);
    setFeedbackEditor(null);
    setInput('');
    setError('');
  }, []);

  const handleOpenConversation = useCallback((id: string) => {
    if (busy || conversationLoading) return;
    setConversationLoading(true);
    setError('');
    fetchConversation(id).then((data) => {
      setConversationId(id);
      if (data) {
        setMessages(data.messages);
        setPending(data.pendingActions);
      }
      setFeedbackEditor(null);
      setInput('');
    }).catch((e) => setError(e.message)).finally(() => setConversationLoading(false));
  }, [busy, conversationLoading, fetchConversation]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    if (busy || conversationLoading) return;
    if (!window.confirm('Excluir definitivamente esta conversa, as avaliações e as propostas ainda não confirmadas? Artigos criados serão preservados.')) return;
    setError('');
    try {
      await deleteConversation(id);
      if (conversationId === id) {
        setConversationId(null);
        setMessages([]);
        setPending([]);
        setFeedbackEditor(null);
      }
      fetchConversations();
    } catch (e) {
      setError(e.message);
    }
  }, [busy, conversationLoading, conversationId, deleteConversation, fetchConversations]);

  const handleSend = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || busy || conversationLoading) return;
    setBusy(true);
    setError('');

    const text = input;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text }]);

    try {
      let id = conversationId;
      if (!id) {
        const created = await createConversation();
        id = created.id;
        setConversationId(id);
      }
      const answer = await sendMessage(id, text);
      setMessages((m) => [...m, { id: answer.id, role: 'assistant', content: answer.answer, sources: answer.sources }]);
      setPending((m) => [...m, ...answer.pendingActions]);
      fetchConversations();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar mensagem');
    } finally {
      setBusy(false);
    }
  }, [conversationId, input, busy, conversationLoading, createConversation, sendMessage, fetchConversations]);

  const handleRate = useCallback(async (messageId: string, rating: 'GOOD' | 'BAD') => {
    if (feedbackSaving) return;
    setFeedbackSaving(messageId);
    setError('');
    try {
      const saved = await rateMessage(messageId, rating);
      setMessages((current) => current.map((m) =>
        m.id === messageId ? { ...m, feedbackRating: saved.rating, feedbackComment: saved.comment } : m
      ));
      setFeedbackEditor(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao avaliar');
    } finally {
      setFeedbackSaving(null);
    }
  }, [feedbackSaving, rateMessage]);

  const handleConfirmPending = useCallback(async (id: string) => {
    setError('');
    try {
      const r = await confirmPending(id);
      setPending((p) => p.filter((x) => x.id !== id));
      setLastDraft(r.versionId);
      fetchDrafts();
    } catch (error) {
      const pendingAction = pending.find((p) => p.id === id);
      if (!duplicateDetected(error, { source: 'pending', pendingId: id, title: pendingAction?.title || 'Proposta de artigo' })) {
        setError(error instanceof Error ? error.message : 'Erro ao confirmar');
      }
    }
  }, [pending, confirmPending, fetchDrafts]);

  function duplicateDetected(error: unknown, prompt: { source: 'panel' | 'pending'; matches: SimilarArticle[]; title: string; spaceId?: string; content?: string; pendingId?: string }): boolean {
    const err = error as Error & { code?: string; matches?: SimilarArticle[] };
    if (err?.code !== 'SIMILAR_ARTICLES' || !Array.isArray(err.matches)) return false;
    setDuplicatePrompt({ ...prompt, matches: err.matches });
    setDuplicateReason('');
    return true;
  }

  const handleContinueDuplicate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!duplicatePrompt) return;
    setError('');
    try {
      if (duplicatePrompt.source === 'panel') {
        const created = await createArticle(
          duplicatePrompt.spaceId!,
          duplicatePrompt.title,
          duplicatePrompt.content!,
          duplicateReason.trim()
        );
        setTitle('');
        setContent('');
        setLastDraft(created.versionId);
      } else {
        const created = await confirmPending(duplicatePrompt.pendingId!);
        setPending((items) => items.filter((x) => x.id !== duplicatePrompt.pendingId));
        setLastDraft(created.versionId);
      }
      setDuplicatePrompt(null);
      setDuplicateReason('');
      fetchDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao continuar');
    }
  }, [duplicatePrompt, duplicateReason, createArticle, confirmPending, fetchDrafts]);

  const handleOpenFeedback = useCallback((messageId: string, rating: 'GOOD' | 'BAD', comment?: string | null) => {
    setFeedbackEditor({ messageId, rating, comment: comment || '' });
  }, []);

  const handleCloseFeedback = useCallback(() => {
    setFeedbackEditor(null);
  }, []);

  const handleSaveFeedback = useCallback(async (messageId: string, rating: 'GOOD' | 'BAD', comment: string) => {
    await rateMessage(messageId, rating, comment);
  }, [rateMessage]);

  const handleOpenSource = useCallback((documentId: string, versionId: string) => {
    // Navigate to knowledge page with document selected
    // This would be handled by the parent layout
  }, []);

  const suggestions = [
    'Como consultar procedimentos de rede?',
    'Como registrar um procedimento novo?',
    'O que fazer quando um servidor não responde?',
  ];

  return (
    <div className="flex-1 flex flex-col h-full">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 flex items-center justify-between animate-in">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError('')}>Fechar</Button>
        </div>
      )}

      {duplicatePrompt && (
        <DuplicatePrompt
          title={duplicatePrompt.title}
          matches={duplicatePrompt.matches}
          onOpen={(id) => {
            // Navigate to knowledge page
          }}
          onContinue={handleContinueDuplicate}
          onCancel={() => { setDuplicatePrompt(null); setDuplicateReason(''); }}
          loading={busy}
        />
      )}

      <div className="flex-1 flex min-h-0">
        <ConversationList
          conversations={conversations}
          activeId={conversationId}
          loading={conversationsLoading}
          onNew={handleNewConversation}
          onOpen={handleOpenConversation}
          onDelete={handleDeleteConversation}
          onRefresh={fetchConversations}
          disabled={busy}
        />

        <ChatArea
          messages={messages}
          loading={false}
          busy={busy}
          conversationLoading={conversationLoading}
          input={input}
          setInput={setInput}
          onSend={handleSend}
          onRate={handleRate}
          onOpenSource={handleOpenSource}
          feedbackSaving={feedbackSaving}
          feedbackEditor={feedbackEditor}
          onOpenFeedback={handleOpenFeedback}
          onCloseFeedback={handleCloseFeedback}
          onSaveFeedback={handleSaveFeedback}
          suggestions={suggestions}
          onSuggestionClick={(text) => setInput(text)}
          disabled={busy}
        />
      </div>

      {pending.length > 0 && (
        <PendingActions
          pending={pending}
          onConfirm={handleConfirmPending}
          onOpenDoc={(id) => { /* navigate to knowledge */ }}
          loading={busy}
        />
      )}
    </div>
  );
}