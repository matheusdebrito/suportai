import { useEffect, useRef } from 'react';
import { cn } from '\.\.\/\.\.\/utils\/cn';
import { Loader, BrainCircuit } from 'lucide-react';
import { Button } from '../ui/Button';
import { MessageBubble } from './MessageBubble';
import { Composer } from './Composer';
import type { Message, Source } from '\.\.\/\.\.\/types';

interface ChatAreaProps {
  messages: Message[];
  loading: boolean;
  busy: boolean;
  conversationLoading: boolean;
  input: string;
  setInput: (value: string) => void;
  onSend: (e: React.FormEvent) => void;
  onRate: (messageId: string, rating: 'GOOD' | 'BAD') => void;
  onOpenSource: (documentId: string, versionId: string) => void;
  feedbackSaving: string | null;
  feedbackEditor: { messageId: string; rating: 'GOOD' | 'BAD'; comment: string } | null;
  onOpenFeedback: (messageId: string, rating: 'GOOD' | 'BAD', comment?: string | null) => void;
  onCloseFeedback: () => void;
  onSaveFeedback: (messageId: string, rating: 'GOOD' | 'BAD', comment: string) => void;
  suggestions?: string[];
  onSuggestionClick: (text: string) => void;
  disabled?: boolean;
}

export function ChatArea({
  messages,
  loading,
  busy,
  conversationLoading,
  input,
  setInput,
  onSend,
  onRate,
  onOpenSource,
  feedbackSaving,
  feedbackEditor,
  onOpenFeedback,
  onCloseFeedback,
  onSaveFeedback,
  suggestions = [],
  onSuggestionClick,
  disabled,
}: ChatAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  if (conversationLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader text="Abrindo conversa..." />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-4 space-y-4" role="log" aria-live="polite">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center gap-4">
            <BrainCircuit className="h-16 w-16 text-surface-300" />
            <div>
              <h2 className="text-xl font-semibold text-surface-900">Como posso ajudar?</h2>
              <p className="mt-2 text-surface-500">
                Consulte procedimentos, investigue problemas ou peça para preparar um artigo no cérebro.
              </p>
            </div>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestions.map((s) => (
                  <Button
                    key={s}
                    variant="outline"
                    size="sm"
                    onClick={() => onSuggestionClick(s)}
                    disabled={disabled || busy}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((message, index) => (
          <MessageBubble
            key={message.id || index}
            message={message}
            onRate={onRate}
            onCopySource={() => {}}
            onOpenSource={onOpenSource}
            feedbackSaving={feedbackSaving}
            feedbackEditor={feedbackEditor}
            onOpenFeedback={onOpenFeedback}
            onCloseFeedback={onCloseFeedback}
            onSaveFeedback={onSaveFeedback}
          />
        ))}

        {busy && (
          <div className="flex justify-center py-4">
            <Loader size="sm" text="Consultando conhecimento..." />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <Composer
        value={input}
        onChange={setInput}
        onSubmit={onSend}
        disabled={disabled}
        busy={busy}
      />
    </div>
  );
}
