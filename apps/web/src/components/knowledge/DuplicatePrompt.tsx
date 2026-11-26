import { useState, FormEvent } from 'react';
import { cn } from '@/utils/cn';
import { BookOpen, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { Badge } from '../ui/Badge';
import type { SimilarArticle } from '@/types';

interface DuplicatePromptProps {
  title: string;
  matches: SimilarArticle[];
  onOpen: (id: string) => void;
  onContinue: (reason: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

export function DuplicatePrompt({
  title,
  matches,
  onOpen,
  onContinue,
  onCancel,
  loading,
}: DuplicatePromptProps) {
  const [reason, setReason] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length >= 15) {
      onContinue(reason.trim());
    }
  };

  return (
    <section className="border border-amber-300 bg-amber-50 rounded-xl p-6 animate-in" role="alert" aria-label="Possíveis artigos duplicados">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-surface-900">Encontramos artigos semelhantes a "{title}"</h3>
            <p className="text-sm text-surface-600 mt-0.5">
              Evite criar um procedimento duplicado. Você pode abrir o conteúdo existente e propor uma atualização,
              ou justificar a criação de um artigo diferente.
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel} aria-label="Fechar">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2 mb-4">
        {matches.map((match) => (
          <div key={match.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-surface-200">
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-surface-400" />
              <span className="font-medium text-surface-900">{match.title}</span>
              <Badge variant="default" size="sm">{match.kind}</Badge>
            </div>
            <Button variant="secondary" size="sm" onClick={() => onOpen(match.id)}>
              Abrir artigo
            </Button>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <Textarea
          label="Por que é necessário criar outro artigo?"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          minLength={15}
          maxLength={500}
          rows={3}
          placeholder="Explique a diferença do novo procedimento..."
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading} disabled={reason.trim().length < 15}>
            Criar novo artigo com justificativa
          </Button>
        </div>
      </form>
    </section>
  );
}
