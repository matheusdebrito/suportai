import { formatDate } from '\.\.\/\.\.\/utils\/format';
import { cn } from '\.\.\/\.\.\/utils\/cn';
import { RotateCcw, Send, Edit, FileText, RotateCw, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge, StatusBadge } from '../ui/Badge';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../ui/DropdownMenu';
import type { Draft } from '\.\.\/\.\.\/types';

interface DraftsListProps {
  drafts: Draft[];
  onView: (versionId: string) => void;
  onSubmit: (versionId: string) => void;
  onCorrect: (versionId: string) => void;
  onPdfCorrection: (draft: Draft) => void;
  onRetry: (versionId: string) => void;
  loading?: boolean;
}

export function DraftsList({
  drafts,
  onView,
  onSubmit,
  onCorrect,
  onPdfCorrection,
  onRetry,
  loading,
}: DraftsListProps) {
  return (
    <section className="mt-6" aria-label="Meus rascunhos">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-surface-900">Meus rascunhos</h2>
        <Button variant="ghost" size="sm" onClick={() => {}} disabled={loading}>
          <RotateCcw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {drafts.length === 0 ? (
        <div className="p-6 text-center border border-surface-200 rounded-lg">
          <p className="text-surface-500">Nenhum rascunho ou revisão pendente.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {drafts.map((draft) => (
            <div key={draft.version_id} className="border border-surface-200 rounded-lg p-4 animate-in">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-surface-900 truncate">{draft.title}</h3>
                    <StatusBadge status={draft.status} />
                    <Badge variant="default" size="sm">v{draft.version_number}</Badge>
                    <Badge variant="info" size="sm">Índice: {draft.index_status}</Badge>
                  </div>
                  <p className="text-sm text-surface-500 truncate">{draft.space_name} · {draft.kind}</p>
                  {draft.ingestion_error && (
                    <p className="mt-1 text-sm text-red-600 bg-red-50 p-2 rounded">{draft.ingestion_error}</p>
                  )}
                  {draft.review_note && (
                    <p className="mt-1 text-sm text-surface-700 bg-surface-50 p-2 rounded">
                      <strong>Parecer:</strong> {draft.review_note}
                    </p>
                  )}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="1" />
                        <circle cx="19" cy="12" r="1" />
                        <circle cx="5" cy="12" r="1" />
                      </svg>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onSelect={() => onView(draft.version_id)}>
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      Ver texto
                    </DropdownMenuItem>

                    {draft.status === 'DRAFT' && draft.index_status === 'READY' && (
                      <DropdownMenuItem onSelect={() => onSubmit(draft.version_id)}>
                        <Send className="h-4 w-4" />
                        Enviar para revisão
                      </DropdownMenuItem>
                    )}

                    {draft.status === 'CHANGES_REQUESTED' && draft.kind === 'ARTICLE' && (
                      <DropdownMenuItem onSelect={() => onCorrect(draft.version_id)}>
                        <Edit className="h-4 w-4" />
                        Preparar correção
                      </DropdownMenuItem>
                    )}

                    {draft.status === 'CHANGES_REQUESTED' && draft.kind === 'PDF' && (
                      <DropdownMenuItem onSelect={() => onPdfCorrection(draft)}>
                        <FileText className="h-4 w-4" />
                        Enviar PDF corrigido
                      </DropdownMenuItem>
                    )}

                    {draft.index_status === 'FAILED' && draft.status !== 'REJECTED' && draft.status !== 'CHANGES_REQUESTED' && (
                      <DropdownMenuItem onSelect={() => onRetry(draft.version_id)}>
                        <RefreshCw className="h-4 w-4" />
                        Reprocessar
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
