import { cn } from '\.\.\/\.\.\/utils\/cn';
import { formatRelativeTime } from '\.\.\/\.\.\/utils\/format';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import type { Conversation } from '\.\.\/\.\.\/types';

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  loading: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
  disabled?: boolean;
}

export function ConversationList({
  conversations,
  activeId,
  loading,
  onNew,
  onOpen,
  onDelete,
  onRefresh,
  disabled,
}: ConversationListProps) {
  return (
    <aside className="w-72 lg:w-80 bg-white border-r border-surface-200 flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b border-surface-200">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-surface-900">Conversas</h2>
          {loading && <span className="animate-spin h-4 w-4 border-2 border-primary-600 border-t-transparent rounded-full" />}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={disabled || loading} aria-label="Atualizar conversas">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onNew} disabled={disabled || loading} aria-label="Nova conversa">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-surface-500 text-sm">Suas conversas aparecem aqui depois da primeira mensagem.</p>
          </div>
        ) : (
          <ul className="divide-y divide-surface-100" role="list">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <div className="flex items-center gap-2 p-3">
                  <button
                    className={cn(
                      'flex-1 text-left py-2 px-3 rounded-lg transition-fast',
                      'focus-ring',
                      activeId === conversation.id
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-surface-700 hover:bg-surface-50'
                    )}
                    onClick={() => onOpen(conversation.id)}
                    disabled={disabled || loading}
                  >
                    <span className="block truncate font-medium">{conversation.title}</span>
                    <span className="block text-xs text-surface-400 truncate mt-0.5">
                      {formatRelativeTime(conversation.updatedAt)}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 hover:opacity-100 transition-opacity group-hover:opacity-100 text-red-500 hover:bg-red-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(conversation.id);
                    }}
                    disabled={disabled || loading}
                    aria-label={`Excluir conversa ${conversation.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
