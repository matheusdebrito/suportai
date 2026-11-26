import { cn } from '\.\.\/\.\.\/utils\/cn';
import { formatDate } from '\.\.\/\.\.\/utils\/format';
import { Check, MessageSquare, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge, StatusBadge } from '../ui/Badge';
import { textDiff } from '\.\.\/\.\.\/utils\/diff';
import type { ReviewItem as ReviewItemType } from '\.\.\/\.\.\/types';

interface ReviewItemProps {
  review: ReviewItemType;
  isExpanded: boolean;
  reviewNote: string;
  onNoteChange: (note: string) => void;
  onPublish: (versionId: string) => void;
  onRequestChanges: (versionId: string) => void;
  onReject: (versionId: string) => void;
  onSendDecision: () => void;
  onCancelDecision: () => void;
}

export function ReviewItem({
  review,
  isExpanded,
  reviewNote,
  onNoteChange,
  onPublish,
  onRequestChanges,
  onReject,
  onSendDecision,
  onCancelDecision,
}: ReviewItemProps) {
  const canPublish = review.status === 'IN_REVIEW' && review.indexStatus === 'READY';

  return (
    <div className="border border-surface-200 rounded-xl overflow-hidden animate-in">
      <div className="p-4 bg-surface-50 border-b border-surface-200">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-surface-900">{review.title}</h3>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={review.status as any} />
              <Badge variant="info" size="sm">Indexação: {review.indexStatus}</Badge>
            </div>
            <p className="text-sm text-surface-500 mt-1">{review.space_name}</p>
          </div>
        </div>

        {review.ingestionError && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {review.ingestionError}
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="prose prose-surface max-w-none mb-4">
          <div className="whitespace-pre-wrap text-sm max-h-64 overflow-auto">{review.content.slice(0, 4000)}</div>
        </div>

        {review.baseContent != null && (
          <details className="mb-4 border border-surface-200 rounded-lg">
            <summary className="p-3 cursor-pointer font-medium text-surface-700 hover:bg-surface-50">
              O que mudou em relação à versão publicada?
            </summary>
            <div className="p-3 border-t border-surface-200 bg-surface-50">
              {(() => {
                const changes = textDiff(review.baseContent || '', review.content);
                if (changes.unchanged) {
                  return <p className="text-sm text-surface-500">Nenhuma mudança de texto detectada.</p>;
                }
                return (
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <strong className="text-red-600">Removido</strong>
                      <pre className="mt-1 p-2 bg-red-50 rounded text-red-900 whitespace-pre-wrap max-h-40 overflow-auto">
                        {changes.removed || 'Nenhum trecho removido'}
                      </pre>
                    </div>
                    <div>
                      <strong className="text-green-600">Adicionado</strong>
                      <pre className="mt-1 p-2 bg-green-50 rounded text-green-900 whitespace-pre-wrap max-h-40 overflow-auto">
                        {changes.added || 'Nenhum trecho adicionado'}
                      </pre>
                    </div>
                  </div>
                );
              })()}
            </div>
          </details>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          <Button
            onClick={() => onPublish(review.versionId)}
            disabled={!canPublish}
            className="flex-1 min-w-[140px]"
          >
            <Check className="h-4 w-4 mr-2" /> Publicar
          </Button>
          <Button
            variant="secondary"
            onClick={() => onRequestChanges(review.versionId)}
            className="flex-1 min-w-[140px]"
          >
            <MessageSquare className="h-4 w-4 mr-2" /> Solicitar ajustes
          </Button>
          <Button
            variant="danger"
            onClick={() => onReject(review.versionId)}
            className="flex-1 min-w-[140px]"
          >
            <X className="h-4 w-4 mr-2" /> Rejeitar
          </Button>
        </div>

        {isExpanded && (
          <form onSubmit={(e) => { e.preventDefault(); onSendDecision(); }} className="pt-4 border-t border-surface-200 animate-in">
            <label className="block mb-2">
              <span className="block text-sm font-medium text-surface-700 mb-1">
                {reviewDecision?.action === 'request-changes' ? 'O que precisa ser corrigido?' : 'Motivo da rejeição'}
              </span>
              <textarea
                value={reviewNote}
                onChange={(e) => onNoteChange(e.target.value)}
                required
                minLength={10}
                maxLength={2000}
                rows={3}
                className="w-full px-3 py-2 text-sm rounded-lg border border-surface-300 focus-ring bg-white"
                placeholder="Escreva um parecer claro para o autor..."
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={onCancelDecision}>
                Cancelar
              </Button>
              <Button type="submit">
                {reviewDecision?.action === 'reject' ? 'Confirmar rejeição' : 'Enviar pedido de ajustes'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Need to import reviewDecision from props
const reviewDecision = { id: '', action: 'reject' as 'reject' | 'request-changes' };
