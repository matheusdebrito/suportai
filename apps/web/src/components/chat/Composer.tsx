import { useRef, useCallback, KeyboardEvent } from 'react';
import { cn } from '\.\.\/\.\.\/utils\/cn';
import { Send } from 'lucide-react';
import { Button } from '../ui/Button';

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  disabled?: boolean;
  busy?: boolean;
  placeholder?: string;
}

export function Composer({ value, onChange, onSubmit, disabled, busy, placeholder = 'Digite sua pergunta...' }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!disabled && !busy && value.trim()) {
          onSubmit(e as unknown as React.FormEvent);
        }
      }
    },
    [value, disabled, busy, onSubmit]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!disabled && !busy && value.trim()) {
        onSubmit(e);
      }
    },
    [value, disabled, busy, onSubmit]
  );

  return (
    <form onSubmit={handleSubmit} className="border-t border-surface-200 p-4 bg-white">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || busy}
          placeholder={placeholder}
          className={cn(
            'flex-1 min-h-[44px] max-h-[200px] px-4 py-3 rounded-xl border resize-none',
            'focus-ring transition-fast',
            'bg-white text-surface-900 placeholder-surface-400',
            'disabled:bg-surface-50 disabled:cursor-not-allowed',
            busy ? 'border-primary-200' : 'border-surface-300'
          )}
          rows={1}
          style={{ height: 'auto' }}
          aria-label="Mensagem"
        />
        <Button
          type="submit"
          size="lg"
          disabled={disabled || busy || !value.trim()}
          aria-label="Enviar mensagem"
          className="flex-shrink-0"
        >
          <Send className="h-5 w-5" />
        </Button>
      </div>
      {(busy || disabled) && (
        <p className="mt-2 text-xs text-surface-500 text-center">
          {busy ? 'Consultando conhecimento...' : 'Aguarde...'}
        </p>
      )}
    </form>
  );
}
