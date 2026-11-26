import { BookOpen, FileText } from 'lucide-react';
import { cn } from '\.\.\/\.\.\/utils\/cn';
import type { Document } from '\.\.\/\.\.\/types';

interface DocumentListProps {
  documents: Document[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  emptyMessage?: string;
}

export function DocumentList({
  documents,
  selectedId,
  onSelect,
  loading,
  emptyMessage = 'Nenhum documento publicado ainda.',
}: DocumentListProps) {
  return (
    <section className="flex-1 overflow-y-auto" aria-label="Documentos publicados">
      {loading ? (
        <div className="p-6 text-center">
          <div className="animate-spin h-8 w-8 border-2 border-primary-600 border-t-transparent rounded-full mx-auto" />
          <p className="mt-2 text-surface-500 text-sm">Carregando documentos...</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="p-6 text-center">
          <BookOpen className="h-12 w-12 text-surface-300 mx-auto mb-3" />
          <p className="text-surface-500">{emptyMessage}</p>
        </div>
      ) : (
        <ul className="divide-y divide-surface-100" role="list">
          {documents.map((doc) => (
            <li key={doc.id}>
              <button
                className={cn(
                  'w-full px-3 py-3 text-left transition-fast',
                  'focus-ring',
                  selectedId === doc.id
                    ? 'bg-primary-50 border-l-2 border-primary-600'
                    : 'hover:bg-surface-50'
                )}
                onClick={() => onSelect(doc.id)}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'p-2 rounded-lg flex-shrink-0',
                    doc.kind === 'PDF' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                  )}>
                    {doc.kind === 'PDF' ? (
                      <FileText className="h-5 w-5" />
                    ) : (
                      <BookOpen className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-surface-900 truncate">{doc.title}</p>
                    <p className="text-xs text-surface-500 truncate mt-0.5">
                      {doc.space_name} · {doc.kind}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
