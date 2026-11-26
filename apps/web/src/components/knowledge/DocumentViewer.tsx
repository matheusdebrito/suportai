import { useState } from 'react';
import { cn } from '\.\.\/\.\.\/utils\/cn';
import { formatDate } from '\.\.\/\.\.\/utils\/format';
import { BookOpen, FileText, RotateCcw, Archive, Download, Edit, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge, StatusBadge } from '../ui/Badge';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../ui/DropdownMenu';
import type { DocumentDetail } from '\.\.\/\.\.\/types';

interface DocumentViewerProps {
  document: DocumentDetail | null;
  spaces: { id: string; name: string; canEdit: boolean; canApprove: boolean }[];
  onEdit: () => void;
  onPdfRevision: () => void;
  onArchive: () => void;
  onClose: () => void;
}

export function DocumentViewer({
  document,
  spaces,
  onEdit,
  onPdfRevision,
  onArchive,
  onClose,
}: DocumentViewerProps) {
  const [showVersions, setShowVersions] = useState(false);

  if (!document) return null;

  const space = spaces.find((s) => s.id === document.space_id);
  const canEdit = space?.canEdit ?? false;
  const canApprove = space?.canApprove ?? false;

  return (
    <article className="flex-1 overflow-y-auto animate-in">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <div className={cn(
              'p-2 rounded-lg',
              document.kind === 'PDF' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
            )}>
              {document.kind === 'PDF' ? <FileText className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-surface-900 truncate">{document.title}</h3>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={document.version.status as any} />
                <Badge variant="default" size="sm">v{document.version.version_number}</Badge>
                {document.isCurrent !== false && <Badge variant="success" size="sm">Vigente</Badge>}
                {document.isCurrent === false && <Badge variant="info" size="sm">Histórica</Badge>}
              </div>
            </div>
          </div>
          <p className="text-sm text-surface-500">{document.space_name} · {document.kind}</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {document.kind === 'ARTICLE' && document.isCurrent !== false && canEdit && (
                <DropdownMenuItem onSelect={onEdit}>
                  <Edit className="h-4 w-4" />
                  Criar revisão
                </DropdownMenuItem>
              )}
              {document.kind === 'PDF' && document.isCurrent !== false && canEdit && (
                <DropdownMenuItem onSelect={onPdfRevision}>
                  <RotateCcw className="h-4 w-4" />
                  Enviar nova versão
                </DropdownMenuItem>
              )}
              {document.isCurrent !== false && canApprove && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onArchive} className="text-red-600">
                    <Archive className="h-4 w-4" />
                    Arquivar documento
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onClose}>
                <ChevronUp className="h-4 w-4" />
                Fechar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="prose prose-surface max-w-none">
        <div className="whitespace-pre-wrap text-sm">{document.version.content}</div>
      </div>
    </article>
  );
}
