import { useState, useCallback, useEffect, FormEvent, ChangeEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useSpaces } from '../hooks/useSpaces';
import { useKnowledge } from '../hooks/useKnowledge';
import { DocumentList } from '../components/knowledge/DocumentList';
import { DocumentViewer } from '../components/knowledge/DocumentViewer';
import { DraftsList } from '../components/knowledge/DraftsList';
import { DraftEditor } from '../components/knowledge/DraftEditor';
import { PendingActions } from '../components/knowledge/PendingActions';
import { DuplicatePrompt } from '../components/knowledge/DuplicatePrompt';
import { Button } from '../components/ui/Button';
import { Loader } from '../components/ui/Loader';
import { Plus, FileUp, RotateCcw, BookOpen } from 'lucide-react';
import { textDiff } from '../utils/diff';
import type { Document, Draft, Space, SimilarArticle } from '../types';

export function KnowledgePage() {
  const { user } = useAuth();
  const { spaces, fetchSpaces, getEditableSpaces } = useSpaces();
  const {
    documents,
    loading: docsLoading,
    fetchDocuments,
    document: selectedDoc,
    loading: docLoading,
    fetchDocument,
    drafts,
    loading: draftsLoading,
    fetchDrafts,
    draft: draftView,
    loading: draftViewLoading,
    fetchDraft,
    createArticle,
    updateArticle,
    createPdf,
    updatePdf,
    correctArticle,
    correctPdf,
    submitReview,
    retryVersion,
    confirmPending,
  } = useKnowledge();

  const [spaceId, setSpaceId] = useState('');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [lastDraft, setLastDraft] = useState<string | null>(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState<{ source: 'panel' | 'pending'; matches: SimilarArticle[]; title: string; spaceId?: string; content?: string; pendingId?: string } | null>(null);
  const [duplicateReason, setDuplicateReason] = useState('');
  const [editing, setEditing] = useState<{ documentId: string; baseVersionId: string } | null>(null);
  const [pdfTarget, setPdfTarget] = useState<{ kind: 'revision' | 'correction'; id: string; baseVersionId?: string; title: string } | null>(null);
  const [correctionOf, setCorrectionOf] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'article' | 'pdf'>('article');

  useEffect(() => {
    fetchSpaces();
    fetchDocuments();
    fetchDrafts();
  }, [fetchSpaces, fetchDocuments, fetchDrafts]);

  useEffect(() => {
    if (spaces.length > 0 && !spaceId) {
      const editable = getEditableSpaces();
      if (editable.length > 0) setSpaceId(editable[0].id);
    }
  }, [spaces, getEditableSpaces, spaceId]);

  const handleOpenDoc = useCallback((id: string) => {
    setSelectedDocId(id);
    fetchDocument(id);
  }, [fetchDocument]);

  const handleViewDraft = useCallback((versionId: string) => {
    fetchDraft(versionId);
  }, [fetchDraft]);

  const handleStartEditing = useCallback(() => {
    if (!selectedDoc || selectedDoc.kind !== 'ARTICLE' || selectedDoc.isCurrent === false) return;
    const editable = getEditableSpaces();
    if (!editable.some((s) => s.id === selectedDoc.space_id)) return;
    setEditing({ documentId: selectedDoc.id, baseVersionId: selectedDoc.version.id });
    setTitle(selectedDoc.title);
    setContent(selectedDoc.version.content);
    setSpaceId(selectedDoc.space_id);
    setLastDraft(null);
  }, [selectedDoc, getEditableSpaces]);

  const handleStartPdfRevision = useCallback(() => {
    if (!selectedDoc || selectedDoc.kind !== 'PDF' || selectedDoc.isCurrent === false) return;
    const editable = getEditableSpaces();
    if (!editable.some((s) => s.id === selectedDoc.space_id)) return;
    setEditing(null);
    setCorrectionOf(null);
    setLastDraft(null);
    setSpaceId(selectedDoc.space_id);
    setPdfTarget({ kind: 'revision', id: selectedDoc.id, baseVersionId: selectedDoc.version.id, title: selectedDoc.title });
  }, [selectedDoc, getEditableSpaces]);

  const handleStartPdfCorrection = useCallback((draft: Draft) => {
    if (draft.kind !== 'PDF' || draft.status !== 'CHANGES_REQUESTED') return;
    setEditing(null);
    setCorrectionOf(null);
    setLastDraft(null);
    setPdfTarget({ kind: 'correction', id: draft.version_id, title: draft.title });
  }, []);

  const handleStartCorrection = useCallback(async (versionId: string) => {
    setError('');
    try {
      const original = await fetchDraft(versionId);
      if (original.status !== 'CHANGES_REQUESTED' || original.kind !== 'ARTICLE') throw new Error('Este artigo não está disponível para correção');
      setPdfTarget(null);
      setEditing(null);
      setCorrectionOf(original.version_id);
      setTitle(original.title);
      setContent(original.content);
      setSpaceId(original.space_id);
      setLastDraft(null);
    } catch (e) {
      setError(e.message);
    }
  }, [fetchDraft]);

  const handleCancelEditing = useCallback(() => {
    setEditing(null);
    setCorrectionOf(null);
    setPdfTarget(null);
    setTitle('');
    setContent('');
    setLastDraft(null);
  }, []);

  const handleSaveArticle = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      let r;
      if (correctionOf) {
        r = await correctArticle(correctionOf, content);
      } else if (editing) {
        r = await updateArticle(editing.documentId, content, editing.baseVersionId);
      } else {
        r = await createArticle(spaceId, title, content);
      }
      setLastDraft(r.versionId);
      setEditing(null);
      setCorrectionOf(null);
      setTitle('');
      setContent('');
      fetchDrafts();
      fetchDocuments();
    } catch (error) {
      if (!editing && !correctionOf && duplicateDetected(error, { source: 'panel', spaceId, title, content })) return;
      setError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadPdf = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      let r;
      if (pdfTarget?.kind === 'revision') {
        r = await updatePdf(pdfTarget.id, pdfTarget.baseVersionId || '', file);
      } else if (!pdfTarget) {
        r = await createPdf(spaceId, file);
      } else {
        r = await correctPdf(pdfTarget.id, file);
      }
      setPdfTarget(null);
      setLastDraft(r.versionId);
      fetchDrafts();
      fetchDocuments();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleRetryVersion = async (id: string) => {
    setError('');
    try {
      await retryVersion(id);
      fetchDrafts();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSubmitVersion = async (id: string) => {
    setError('');
    try {
      await submitReview(id);
      setLastDraft(null);
      fetchDrafts();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleConfirmPending = async (id: string) => {
    setError('');
    try {
      const r = await confirmPending(id);
      setLastDraft(r.versionId);
      fetchDrafts();
    } catch (error) {
      const pendingAction = pending.find((p) => p.id === id);
      if (!duplicateDetected(error, { source: 'pending', pendingId: id, title: pendingAction?.title || 'Proposta de artigo' })) {
        setError(error.message);
      }
    }
  };

  const [pending, setPending] = useState<import('../types').PendingAction[]>([]);

  function duplicateDetected(error: unknown, prompt: { source: 'panel' | 'pending'; matches: SimilarArticle[]; title: string; spaceId?: string; content?: string; pendingId?: string }): boolean {
    const err = error as Error & { code?: string; matches?: SimilarArticle[] };
    if (err?.code !== 'SIMILAR_ARTICLES' || !Array.isArray(err.matches)) return false;
    setDuplicatePrompt({ ...prompt, matches: err.matches });
    setDuplicateReason('');
    return true;
  }

  const handleContinueDuplicate = async (e: FormEvent) => {
    e.preventDefault();
    if (!duplicatePrompt) return;
    setError('');
    try {
      if (duplicatePrompt.source === 'panel') {
        const created = await createArticle(duplicatePrompt.spaceId!, duplicatePrompt.title, duplicatePrompt.content!, duplicateReason.trim());
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
      setError(err.message);
    }
  };

  const editableSpaces = getEditableSpaces();

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
          onOpen={(id) => handleOpenDoc(id)}
          onContinue={handleContinueDuplicate}
          onCancel={() => { setDuplicatePrompt(null); setDuplicateReason(''); }}
          loading={submitting}
        />
      )}

      <div className="flex-1 flex min-h-0">
        <div className="w-72 lg:w-80 border-r border-surface-200 flex flex-col">
          <DocumentList
            documents={documents}
            selectedId={selectedDocId}
            onSelect={handleOpenDoc}
            loading={docsLoading}
          />

          {selectedDoc && (
            <DocumentViewer
              document={selectedDoc}
              spaces={spaces}
              onEdit={handleStartEditing}
              onPdfRevision={handleStartPdfRevision}
              onArchive={() => {}}
              onClose={() => { setSelectedDocId(null); }}
            />
          )}

          <DraftsList
            drafts={drafts}
            onView={handleViewDraft}
            onSubmit={handleSubmitVersion}
            onCorrect={handleStartCorrection}
            onPdfCorrection={handleStartPdfCorrection}
            onRetry={handleRetryVersion}
            loading={draftsLoading}
          />

          {draftView && (
            <div className="p-4 border-t border-surface-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-surface-900">{draftView.title} · v{draftView.version_number}</h3>
                <Button variant="ghost" size="sm" onClick={() => setDraftView(null)}>
                  <BookOpen className="h-4 w-4" /> Fechar
                </Button>
              </div>
              <div className="text-sm text-surface-600 whitespace-pre-wrap">{draftView.content || 'Aguardando extração do PDF.'}</div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          <DraftEditor
            mode={pdfTarget ? (pdfTarget.kind === 'revision' ? 'pdf-revision' : 'pdf-correction') : correctionOf ? 'correct' : editing ? 'edit' : 'create'}
            spaces={spaces}
            selectedSpaceId={spaceId}
            onSpaceChange={setSpaceId}
            title={title}
            onTitleChange={setTitle}
            content={content}
            onContentChange={setContent}
            onSubmit={handleSaveArticle}
            onCancel={handleCancelEditing}
            onPdfUpload={handleUploadPdf}
            pdfTarget={pdfTarget}
            correctionOf={correctionOf}
            editing={editing}
            selectedDoc={selectedDoc}
            lastDraft={lastDraft}
            onRefreshDrafts={fetchDrafts}
            submitting={submitting}
            uploading={uploading}
          />
        </div>
      </div>

      {pending.length > 0 && (
        <PendingActions
          pending={pending}
          onConfirm={handleConfirmPending}
          onOpenDoc={handleOpenDoc}
          loading={submitting}
        />
      )}
    </div>
  );
}
