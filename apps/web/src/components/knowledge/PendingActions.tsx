import { cn } from '\.\.\/\.\.\/utils\/cn';
import { formatDate } from '\.\.\/\.\.\/utils\/format';
import { Check, BookOpen, X, RotateCcw } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { textDiff } from '\.\.\/\.\.\/utils\/diff';
import type { PendingAction } from '\.\.\/\.\.\/types';

interface PendingActionsProps {
  pending: PendingAction[];
  onConfirm: (id: string) => void;
  onOpenDoc: (id: string) => void;
  onDuplicateDetected?: (reason: string) => void;
  loading?: boolean;
}

export function PendingActions({
  pending,
  onConfirm,
  onOpenDoc,
  loading,
}: PendingActionsProps) {
  if (pending.length === 0) return null;

  return (
    <div className="space-y-3 mt-4" role="list" aria-label="Prévias pendentes de confirmação">
      {pending.map((p) => (
        <div key={p.id} className="border border-surface-200 rounded-lg p-4 animate-in" role="listitem">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1">
              <h3 className="font-semibold text-surface-900">Prévia: {p.title}</h3>
              <p className="text-sm text-surface-500 mt-0.5">Destino: {p.spaceName || 'Espaço autorizado'}</p>
            </div>
          </div>

          {p.documentId ? (
            <>
              <p className="text-sm text-surface-600 mb-3">
                Atualização de artigo existente — a versão publicada permanecerá intacta até a aprovação.
              </p>
              <details className="mb-3 group">
                <summary className="cursor-pointer font-medium text-surface-700 hover:text-surface-900 flex items-center gap-1">
                  <RotateCcw className="h-4 w-4 transition-transform group-open:rotate-180" />
                  Ver diferenças entre o artigo publicado e a proposta
                </summary>
                <div className="mt-3 p-3 bg-surface-50 rounded-lg border border-surface-200">
                  {(() => {
                    const changes = textDiff(p.beforeContent || '', p.content);
                    if (changes.unchanged) {
                      return <p className="text-sm text-surface-500">O conteúdo proposto não apresenta diferenças.</p>;
                    }
                    return (
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <strong className="text-red-600">Anterior</strong>
                          <pre className="mt-1 p-2 bg-red-50 rounded text-red-900 whitespace-pre-wrap max-h-40 overflow-auto">
                            {changes.removed || 'Nenhum trecho removido'}
                          </pre>
                        </div>
                        <div>
                          <strong className="text-green-600">Proposto</strong>
                          <pre className="mt-1 p-2 bg-green-50 rounded text-green-900 whitespace-pre-wrap max-h-40 overflow-auto">
                            {changes.added || 'Nenhum trecho adicionado'}
                          </pre>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </details>
              <Button variant="secondary" size="sm" onClick={() => onOpenDoc(p.documentId!)} className="mb-3">
                <BookOpen className="h-4 w-4 mr-1" /> Abrir artigo publicado
              </Button>
            </>
          ) : (
            <p className="text-sm text-surface-600 mb-3 whitespace-pre-wrap max-h-40 overflow-auto">{p.content.slice(0, 900)}</p>
          )}

          <Button
            onClick={() => onConfirm(p.id)}
            loading={loading}
            className="w-full"
          >
            <Check className="h-4 w-4 mr-2" />
            {p.documentId ? 'Confirmar proposta de atualização' : 'Confirmar criação de rascunho'}
          </Button>
        </div>
      ))}
    </div>
  );
}
