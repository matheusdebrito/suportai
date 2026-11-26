import { useCallback } from 'react';
import { useApi } from './useApi';
import { knowledgeApi } from '../api/client';
import type { Document, DocumentDetail, Draft, DraftDetail, ReviewItem, ArchivedDocument, PendingAction, SimilarArticle } from '../types';

export function useDocuments() {
  const { data, loading, error, execute: fetchDocuments, reset } = useApi(knowledgeApi.listDocuments);

  return {
    documents: data?.documents ?? [],
    loading,
    error,
    fetchDocuments,
    reset,
  };
}

export function useDocument(id: string | null) {
  const { data, loading, error, execute: fetchDocument, reset } = useApi(
    useCallback(() => (id ? knowledgeApi.getDocument(id) : Promise.resolve(null)), [id])
  );

  return {
    document: data ?? null,
    loading,
    error,
    fetchDocument,
    reset,
  };
}

export function useDrafts() {
  const { data, loading, error, execute: fetchDrafts, reset } = useApi(knowledgeApi.listDrafts);

  return {
    drafts: data?.drafts ?? [],
    loading,
    error,
    fetchDrafts,
    reset,
  };
}

export function useDraft(versionId: string | null) {
  const { data, loading, error, execute: fetchDraft, reset } = useApi(
    useCallback(() => (versionId ? knowledgeApi.getDraft(versionId) : Promise.resolve(null)), [versionId])
  );

  return {
    draft: data ?? null,
    loading,
    error,
    fetchDraft,
    reset,
  };
}

export function useReviews() {
  const { data, loading, error, execute: fetchReviews, reset } = useApi(knowledgeApi.listReviews);

  return {
    reviews: data?.reviews ?? [],
    loading,
    error,
    fetchReviews,
    reset,
  };
}

export function useArchived() {
  const { data, loading, error, execute: fetchArchived, reset } = useApi(knowledgeApi.listArchived);

  return {
    archived: data?.documents ?? [],
    loading,
    error,
    fetchArchived,
    reset,
  };
}

export function useKnowledgeActions() {
  const createArticle = useApi(knowledgeApi.createArticle);
  const updateArticle = useApi(knowledgeApi.updateArticle);
  const createPdf = useApi(knowledgeApi.createPdf);
  const updatePdf = useApi(knowledgeApi.updatePdf);
  const retryVersion = useApi(knowledgeApi.retryVersion);
  const submitReview = useApi(knowledgeApi.submitReview);
  const publishVersion = useApi(knowledgeApi.publishVersion);
  const requestChanges = useApi(knowledgeApi.requestChanges);
  const correctArticle = useApi(knowledgeApi.correctArticle);
  const correctPdf = useApi(knowledgeApi.correctPdf);
  const rejectVersion = useApi(knowledgeApi.rejectVersion);
  const confirmPending = useApi(knowledgeApi.confirmPending);
  const archiveDocument = useApi(knowledgeApi.archiveDocument);
  const restoreDocument = useApi(knowledgeApi.restoreDocument);

  return {
    createArticle,
    updateArticle,
    createPdf,
    updatePdf,
    retryVersion,
    submitReview,
    publishVersion,
    requestChanges,
    correctArticle,
    correctPdf,
    rejectVersion,
    confirmPending,
    archiveDocument,
    restoreDocument,
  };
}

export function useKnowledge() {
  const documents = useDocuments();
  const drafts = useDrafts();
  const reviews = useReviews();
  const archived = useArchived();
  const actions = useKnowledgeActions();

  return {
    ...documents,
    ...drafts,
    ...reviews,
    ...archived,
    ...actions,
  };
}