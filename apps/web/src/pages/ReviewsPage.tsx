import { useState, useCallback, useEffect, FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useKnowledge } from '../hooks/useKnowledge';
import { ReviewQueue } from '../components/reviews/ReviewQueue';
import { Loader } from '../components/ui/Loader';
import { RotateCcw } from 'lucide-react';

export function ReviewsPage() {
  const { user } = useAuth();
  const {
    reviews,
    loading: reviewsLoading,
    fetchReviews,
    archived,
    loading: archivedLoading,
    fetchArchived,
    publishVersion,
    requestChanges,
    rejectVersion,
  } = useKnowledge();

  const [reviewDecision, setReviewDecision] = useState<{ id: string; action: 'reject' | 'request-changes' } | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  useEffect(() => {
    fetchReviews();
    fetchArchived();
  }, [fetchReviews, fetchArchived]);

  const handleRefresh = useCallback(() => {
    fetchReviews();
    fetchArchived();
  }, [fetchReviews, fetchArchived]);

  const handlePublish = useCallback(async (versionId: string) => {
    try {
      await publishVersion(versionId);
    } catch (e) {
      alert(e.message);
    }
  }, [publishVersion]);

  const handleRequestChanges = useCallback((versionId: string) => {
    setReviewDecision({ id: versionId, action: 'request-changes' });
    setReviewNote('');
  }, []);

  const handleReject = useCallback((versionId: string) => {
    setReviewDecision({ id: versionId, action: 'reject' });
    setReviewNote('');
  }, []);

  const handleSendDecision = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!reviewDecision) return;
    try {
      if (reviewDecision.action === 'request-changes') {
        await requestChanges(reviewDecision.id, reviewNote.trim());
      } else {
        await rejectVersion(reviewDecision.id, reviewNote.trim());
      }
      setReviewDecision(null);
      setReviewNote('');
      fetchReviews();
    } catch (e) {
      alert(e.message);
    }
  }, [reviewDecision, reviewNote, requestChanges, rejectVersion, fetchReviews]);

  const handleCancelDecision = useCallback(() => {
    setReviewDecision(null);
    setReviewNote('');
  }, []);

  return (
    <ReviewQueue
      reviews={reviews}
      archived={archived}
      loading={reviewsLoading || archivedLoading}
      onRefresh={handleRefresh}
      onPublish={handlePublish}
      onRequestChanges={handleRequestChanges}
      onReject={handleReject}
      onRestore={() => {}}
      reviewDecision={reviewDecision}
      reviewNote={reviewNote}
      onReviewNoteChange={setReviewNote}
      onSendDecision={handleSendDecision}
      onCancelDecision={handleCancelDecision}
    />
  );
}
