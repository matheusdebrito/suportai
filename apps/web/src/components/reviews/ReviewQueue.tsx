import { cn } from '\.\.\/\.\.\/utils\/cn';
import { formatDate } from '\.\.\/\.\.\/utils\/format';
import { Check, RotateCcw, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge, StatusBadge } from '../ui/Badge';
import { ReviewItem } from './ReviewItem';
import type { ReviewItem as ReviewItemType, ArchivedDocument } from '\.\.\/\.\.\/types';

interface ReviewQueueProps {
  reviews: ReviewItemType[];
  archived: ArchivedDocument[];
  loading: boolean;
  onRefresh: () => void;
  onPublish: (versionId: string) => void;
  onRequestChanges: (versionId: string) => void;
  onReject: (versionId: string) => void;
  onRestore: (id: string) => void;
  reviewDecision?: { id: string; action: 'reject' | 'request-changes' } | null;
  reviewNote: string;
  onReviewNoteChange: (note: string) => void;
  onSendDecision: () => void;
  onCancelDecision: () => void;
}

export function ReviewQueue({
  reviews,
  archived,
  loading,
  onRefresh,
  onPublish,
  onRequestChanges,
  onReject,
  onRestore,
  reviewDecision,
  reviewNote,
  onReviewNoteChange,
  onSendDecision,
  onCancelDecision,
}: ReviewQueueProps) {
  return (
    <section className="flex-1 overflow-y-auto" aria-label="Central de revisão">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-surface-900">Conteúdos em revisão</h2>
          <p className="text-surface-500 text-sm">Aprove, solicite ajustes ou rejeite propostas pendentes.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
          <RotateCcw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {reviews.length === 0 && !loading ? (
        <div className="p-8 text-center border border-surface-200 rounded-lg">
          <p className="text-surface-500">Nenhum conteúdo pendente.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <ReviewItem
              key={review.version_id}
              review={review}
              isExpanded={reviewDecision?.id === review.version_id}
              reviewNote={reviewNote}
              onNoteChange={onReviewNoteChange}
              onPublish={onPublish}
              onRequestChanges={onRequestChanges}
              onReject={onReject}
              onSendDecision={onSendDecision}
              onCancelDecision={onCancelDecision}
            />
          ))}
        </div>
      )}

      <div className="mt-8 border-t border-surface-200 pt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-surface-900">Documentos arquivados</h2>
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
            <RotateCcw className="h-4 w-4" />
            Atualizar
          </Button>
        </div>

        {archived.length === 0 ? (
          <div className="p-6 text-center border border-surface-200 rounded-lg">
            <p className="text-surface-500">Nenhum documento arquivado em seus espaços de aprovação.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {archived.map((item) => (
              <div key={item.id} className="border border-surface-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-surface-900">{item.title}</h3>
                    <p className="text-sm text-surface-500 mt-0.5">
                      {item.space_name} · {item.kind} · Arquivado em {formatDate(item.archivedAt)}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => onRestore(item.id)}>
                    Restaurar versão publicada
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
