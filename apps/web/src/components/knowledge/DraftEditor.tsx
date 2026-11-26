import { useState, FormEvent, ChangeEvent } from 'react';
import { cn } from '\.\.\/\.\.\/utils\/cn';
import { Plus, FileUp, X, RotateCcw } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Badge } from '../ui/Badge';
import type { Draft, Space } from '\.\.\/\.\.\/types';

interface DraftEditorProps {
  mode: 'create' | 'edit' | 'correct' | 'pdf-revision' | 'pdf-correction';
  spaces: Space[];
  selectedSpaceId: string;
  onSpaceChange: (id: string) => void;
  title: string;
  onTitleChange: (value: string) => void;
  content: string;
  onContentChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  onPdfUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  pdfTarget?: { kind: 'revision' | 'correction'; title: string } | null;
  correctionOf?: string | null;
  editing?: { documentId: string; baseVersionId: string } | null;
  selectedDoc?: { version: { content: string } } | null;
  lastDraft?: string | null;
  onRefreshDrafts: () => void;
  submitting?: boolean;
  uploading?: boolean;
}

export function DraftEditor({
  mode,
  spaces,
  selectedSpaceId,
  onSpaceChange,
  title,
  onTitleChange,
  content,
  onContentChange,
  onSubmit,
  onCancel,
  onPdfUpload,
  pdfTarget,
  correctionOf,
  editing,
  selectedDoc,
  lastDraft,
  onRefreshDrafts,
  submitting,
  uploading,
}: DraftEditorProps) {
  const [activeTab, setActiveTab] = useState<'article' | 'pdf'>('article');
  const editableSpaces = spaces.filter((s) => s.canEdit);

  const isArticleMode = mode === 'create' || mode === 'edit' || mode === 'correct';
  const isPdfMode = mode === 'pdf-revision' || mode === 'pdf-correction' || pdfTarget;

  if (editableSpaces.length === 0) {
    return (
      <div className="p-6 text-center border border-surface-200 rounded-lg">
        <p className="text-surface-500">Você não possui permissão de edição em nenhum espaço.</p>
      </div>
    );
  }

  const getHint = () => {
    if (pdfTarget) {
      return 'O novo arquivo será processado como rascunho. O PDF publicado continuará disponível até a aprovação.';
    }
    if (correctionOf) {
      return 'A correção será uma nova versão em rascunho.';
    }
    if (editing) {
      return 'A revisão só substituirá o artigo publicado após aprovação.';
    }
    return 'Crie um artigo ou importe um PDF. O conteúdo só ficará público após revisão.';
  };

  const getTitle = () => {
    if (pdfTarget) return 'Enviar versão de PDF';
    if (correctionOf) return 'Corrigir proposta';
    if (editing) return 'Propor atualização';
    return 'Adicionar conhecimento';
  };

  return (
    <section className="border border-surface-200 rounded-xl p-6 bg-white animate-in">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-surface-900">{getTitle()}</h2>
        <p className="mt-1 text-sm text-surface-500">{getHint()}</p>
      </div>

      <div className="flex gap-2 mb-4 border-b border-surface-200">
        <button
          type="button"
          className={cn(
            'px-4 py-2 rounded-t-lg font-medium text-sm transition-fast border-b-2 -mb-px',
            activeTab === 'article'
              ? 'border-primary-600 text-primary-600 bg-primary-50'
              : 'border-transparent text-surface-500 hover:text-surface-700'
          )}
          onClick={() => { setActiveTab('article'); onSpaceChange(selectedSpaceId); }}
          disabled={isPdfMode}
        >
          <Plus className="h-4 w-4 mr-1.5" /> Criar Artigo
        </button>
        <button
          type="button"
          className={cn(
            'px-4 py-2 rounded-t-lg font-medium text-sm transition-fast border-b-2 -mb-px',
            activeTab === 'pdf'
              ? 'border-primary-600 text-primary-600 bg-primary-50'
              : 'border-transparent text-surface-500 hover:text-surface-700'
          )}
          onClick={() => { setActiveTab('pdf'); }}
          disabled={!isPdfMode}
        >
          <FileUp className="h-4 w-4 mr-1.5" /> Enviar PDF
        </button>
      </div>

      {activeTab === 'article' && !editing && !correctionOf && (
        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="Título"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            required
            minLength={3}
            maxLength={200}
            placeholder="Título do artigo"
          />
          <Textarea
            label="Procedimento"
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            required
            minLength={20}
            maxLength={100000}
            rows={7}
            placeholder="Descreva o procedimento, pré-requisitos, passos, validação..."
          />
          <Button type="submit" className="w-full" loading={submitting}>
            <Plus className="h-4 w-4 mr-2" /> Criar rascunho
          </Button>
        </form>
      )}

      {editing && (
        <>
          <details className="mb-4 border border-surface-200 rounded-lg">
            <summary className="p-3 cursor-pointer font-medium text-surface-700 hover:bg-surface-50">
              Comparar alterações com a versão publicada
            </summary>
            <div className="p-3 border-t border-surface-200 bg-surface-50">
              {selectedDoc && (() => {
                const before = selectedDoc.version.content;
                const after = content;
                const a = before.replace(/\r\n/g, '\n').split('\n');
                const b = after.replace(/\r\n/g, '\n').split('\n');
                let prefix = 0;
                while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
                let suffix = 0;
                while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
                const removed = a.slice(prefix, a.length - suffix).join('\n');
                const added = b.slice(prefix, b.length - suffix).join('\n');
                if (removed === '' && added === '') {
                  return <p className="text-sm text-surface-500">Nenhuma mudança detectada.</p>;
                }
                return (
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div><strong className="text-red-600">Removido</strong><pre className="mt-1 p-2 bg-red-50 rounded text-red-900 whitespace-pre-wrap max-h-40 overflow-auto">{removed || 'Nenhum trecho removido'}</pre></div>
                    <div><strong className="text-green-600">Adicionado</strong><pre className="mt-1 p-2 bg-green-50 rounded text-green-900 whitespace-pre-wrap max-h-40 overflow-auto">{added || 'Nenhum trecho adicionado'}</pre></div>
                  </div>
                );
              })()}
            </div>
          </details>
          <Textarea
            label="Procedimento"
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            required
            minLength={20}
            maxLength={100000}
            rows={7}
          />
          <Button type="button" onClick={onSubmit} className="w-full" loading={submitting}>
            <Plus className="h-4 w-4 mr-2" /> Salvar revisão
          </Button>
        </>
      )}

      {correctionOf && (
        <>
          <Textarea
            label="Artigo corrigido"
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            required
            minLength={20}
            maxLength={100000}
            rows={7}
          />
          <Button type="button" onClick={onSubmit} className="w-full" loading={submitting}>
            <Plus className="h-4 w-4 mr-2" /> Enviar correção
          </Button>
        </>
      )}

      {activeTab === 'pdf' && (
        <>
          <label className="block">
            <div className="flex items-center justify-center p-8 border-2 border-dashed border-surface-300 rounded-lg hover:border-primary-400 transition-colors cursor-pointer bg-surface-50">
              <div className="text-center">
                <FileUp className="h-12 w-12 text-surface-400 mx-auto mb-3" />
                <p className="text-surface-600">{pdfTarget ? `Selecionar arquivo corrigido: ${pdfTarget.title}` : 'Enviar PDF'}</p>
                <p className="text-xs text-surface-400 mt-1">Arraste e solte ou clique para selecionar</p>
              </div>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={onPdfUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
                disabled={uploading}
              />
            </div>
          </label>
          {pdfTarget && (
            <Button variant="ghost" size="sm" onClick={onCancel} className="mt-2">
              <X className="h-4 w-4 mr-1" /> Cancelar envio
            </Button>
          )}
        </>
      )}

      {lastDraft && (
        <div className="mt-4 p-4 rounded-lg bg-primary-50 border border-primary-200 animate-in">
          <p className="text-sm text-primary-800">Rascunho salvo. Aguarde o processamento; consulte "Meus rascunhos" para enviar para revisão quando estiver pronto.</p>
          <Button variant="ghost" size="sm" onClick={onRefreshDrafts} className="mt-2">
            <RotateCcw className="h-4 w-4 mr-1" /> Atualizar rascunhos
          </Button>
        </div>
      )}
    </section>
  );
}
