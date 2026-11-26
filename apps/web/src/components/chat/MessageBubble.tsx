import { cn } from '\.\.\/\.\.\/utils\/cn';
import { formatRelativeTime } from '\.\.\/\.\.\/utils\/format';
import { ThumbsUp, ThumbsDown, MessageSquare, Copy, Check } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import type { Message, Source } from '\.\.\/\.\.\/types';

interface MessageBubbleProps {
  message: Message;
  onRate: (messageId: string, rating: 'GOOD' | 'BAD') => void;
  onCopySource: (source: Source) => void;
  onOpenSource: (documentId: string, versionId: string) => void;
  feedbackSaving?: string | null;
  feedbackEditor?: { messageId: string; rating: 'GOOD' | 'BAD'; comment: string } | null;
  onOpenFeedback: (messageId: string, rating: 'GOOD' | 'BAD', comment?: string | null) => void;
  onCloseFeedback: () => void;
  onSaveFeedback: (messageId: string, rating: 'GOOD' | 'BAD', comment: string) => void;
}

export function MessageBubble({
  message,
  onRate,
  onCopySource,
  onOpenSource,
  feedbackSaving,
  feedbackEditor,
  onOpenFeedback,
  onCloseFeedback,
  onSaveFeedback,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const sources = message.sources || [];
  const hasFeedback = message.feedbackRating !== null && message.feedbackRating !== undefined;
  const isEditingFeedback = feedbackEditor?.messageId === message.id;

  return (
    <div className={cn('flex gap-3 animate-in', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="h-5 w-5 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>
      )}

      <div className={cn('flex-1 min-w-0', isUser ? 'text-right' : '')}>
        <div
          className={cn(
            'inline-block max-w-[85%] px-4 py-2.5 rounded-2xl',
            isUser
              ? 'bg-primary-600 text-white rounded-tr-sm'
              : 'bg-surface-100 text-surface-900 rounded-tl-sm'
          )}
        >
          <div className="whitespace-pre-wrap text-sm">{message.content}</div>
        </div>

        {sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" style={{ direction: isUser ? 'rtl' : 'ltr' }}>
            {sources.map((source, index) => (
              <button
                key={`${source.versionId}-${index}`}
                onClick={() => onOpenSource(source.documentId, source.versionId)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-fast',
                  'hover:shadow-sm focus-ring',
                  isUser
                    ? 'bg-primary-100 text-primary-800 hover:bg-primary-200'
                    : 'bg-white text-surface-700 border border-surface-200 hover:bg-surface-50'
                )}
                title={source.excerpts?.join('\n')}
              >
                {source.historical && (
                  <Badge variant="info" size="sm">histórica</Badge>
                )}
                <span className="truncate max-w-[200px]">{source.title}</span>
                <span className="text-surface-500">v{source.versionNumber ?? source.versionId.slice(0, 8)}</span>
                {source.excerpts && source.excerpts.length > 0 && (
                  <Badge variant="default" size="sm">{source.excerpts.length} trecho(s)</Badge>
                )}
              </button>
            ))}
          </div>
        )}

        {message.id && message.role === 'assistant' && (
          <div className="mt-3 flex items-center gap-2" style={{ justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
            <span className="text-xs text-surface-500">Esta resposta ajudou?</span>
            <Button
              variant={hasFeedback && message.feedbackRating === 'GOOD' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => onRate(message.id!, 'GOOD')}
              disabled={feedbackSaving === message.id}
              aria-pressed={hasFeedback && message.feedbackRating === 'GOOD'}
              aria-label="Resposta útil"
            >
              <ThumbsUp className="h-4 w-4" />
            </Button>
            <Button
              variant={hasFeedback && message.feedbackRating === 'BAD' ? 'danger' : 'ghost'}
              size="sm"
              onClick={() => onRate(message.id!, 'BAD')}
              disabled={feedbackSaving === message.id}
              aria-pressed={hasFeedback && message.feedbackRating === 'BAD'}
              aria-label="Resposta não útil"
            >
              <ThumbsDown className="h-4 w-4" />
            </Button>
            {hasFeedback && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenFeedback(message.id!, message.feedbackRating!, message.feedbackComment || '')}
                className="text-surface-500 hover:text-surface-700"
              >
                {message.feedbackComment ? (
                  <>
                    <MessageSquare className="h-4 w-4" />
                    <span className="hidden sm:inline">Editar comentário</span>
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-4 w-4" />
                    <span className="hidden sm:inline">Adicionar comentário</span>
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {isEditingFeedback && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSaveFeedback(message.id!, feedbackEditor.rating, feedbackEditor.comment);
            }}
            className="mt-3 p-3 rounded-lg bg-surface-50 border border-surface-200 animate-in"
          >
            <textarea
              value={feedbackEditor.comment}
              onChange={(e) => onOpenFeedback(message.id!, feedbackEditor.rating, e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border border-surface-300 focus-ring bg-white"
              placeholder="Comentário opcional, sem senhas ou tokens"
              maxLength={1000}
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" type="button" onClick={onCloseFeedback}>
                Cancelar
              </Button>
              <Button size="sm" type="submit" disabled={feedbackSaving === message.id}>
                Salvar avaliação
              </Button>
            </div>
          </form>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-surface-200 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-sm font-medium text-surface-600">Você</span>
        </div>
      )}
    </div>
  );
}
