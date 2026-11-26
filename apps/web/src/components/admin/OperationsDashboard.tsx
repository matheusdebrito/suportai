import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/format';
import { RotateCcw, Database, Cpu, AlertCircle, CheckCircle, MessageCircle, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import type { OperationsData } from '@/types';

interface OperationsDashboardProps {
  operations: OperationsData | null;
  loading: boolean;
  onRefresh: () => void;
}

const statCards = [
  { key: 'knowledge.published', label: 'Documentos publicados', icon: Database, color: 'blue' },
  { key: 'knowledge.archived', label: 'Arquivados', icon: Archive, color: 'gray' },
  { key: 'ingestion.pending', label: 'Na fila', icon: Clock, color: 'yellow' },
  { key: 'ingestion.running', label: 'Processando', icon: Cpu, color: 'blue' },
  { key: 'ingestion.failed', label: 'Falhas registradas', icon: AlertCircle, color: 'red' },
  { key: 'ingestion.stalled', label: 'Processamentos atrasados', icon: TrendingDown, color: 'orange' },
  { key: 'conversation.questions_7d', label: 'Perguntas (7 dias)', icon: MessageCircle, color: 'green' },
  { key: 'conversation.answers_7d', label: 'Respostas (7 dias)', icon: CheckCircle, color: 'green' },
  { key: 'feedback.good_7d', label: 'Úteis (7 dias)', icon: TrendingUp, color: 'green' },
  { key: 'feedback.bad_7d', label: 'Não úteis (7 dias)', icon: TrendingDown, color: 'red' },
] as const;

function getValue(obj: any, path: string): number {
  return path.split('.').reduce((o, k) => (o || {})[k], 0);
}

function getIconColor(color: string) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-600',
    gray: 'bg-surface-100 text-surface-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600',
    orange: 'bg-orange-100 text-orange-600',
  };
  return colors[color] || colors.gray;
}

export function OperationsDashboard({
  operations,
  loading,
  onRefresh,
}: OperationsDashboardProps) {
  if (loading || !operations) {
    return (
      <section className="border border-surface-200 rounded-xl p-6 bg-white">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-surface-900">Operação do SuportAI</h2>
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
            <RotateCcw className="h-4 w-4 animate-spin" />
            Atualizar
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="p-4 bg-surface-50 rounded-lg animate-pulse">
              <div className="h-4 bg-surface-200 rounded w-3/4 mb-2" />
              <div className="h-8 bg-surface-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="border border-surface-200 rounded-xl p-6 bg-white">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-surface-900">Operação do SuportAI</h2>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
          <RotateCcw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {statCards.map(({ key, label, icon: Icon, color }) => (
          <div key={key} className="p-4 bg-surface-50 rounded-lg border border-surface-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">{label}</span>
              <div className={cn('p-2 rounded-lg', getIconColor(color))}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-surface-900">{getValue(operations, key)}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-surface-200 pt-4 space-y-2 text-sm">
        <div className="flex items-center gap-2 text-surface-600">
          <Badge variant={operations.external_ai_enabled ? 'success' : 'default'} size="sm">
            IA externa: {operations.external_ai_enabled ? 'Habilitada por configuração' : 'Desabilitada'}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-surface-600">
          <Clock className="h-4 w-4" />
          <span>Último processamento: {operations.ingestion.last_completed_at ? formatDateTime(operations.ingestion.last_completed_at) : 'Nenhum'}</span>
        </div>
        <div className="flex items-center gap-2 text-surface-600">
          <Clock className="h-4 w-4" />
          <span>Atualizado: {formatDateTime(operations.observed_at)}</span>
        </div>
        <p className="text-surface-500 text-xs mt-2">
          Indicadores agregados, sem conteúdo de conversas ou documentos. Não substitui logs, alertas nem avaliação de qualidade com modelo real.
        </p>
      </div>
    </section>
  );
}

// Need to import Archive
import { Archive } from 'lucide-react';
