import { cn } from '../../utils/cn';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
  className?: string;
}

const variants = {
  default: 'bg-surface-100 text-surface-700',
  primary: 'bg-primary-100 text-primary-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
};

const sizes = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

export function Badge({ children, variant = 'default', size = 'md', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </span>
  );
}

export function RoleBadge({ role }: { role: 'ADMIN' | 'APPROVER' | 'USER' }) {
  const variants: Record<'ADMIN' | 'APPROVER' | 'USER', 'danger' | 'primary' | 'default'> = {
    ADMIN: 'danger',
    APPROVER: 'primary',
    USER: 'default',
  };

  const labels: Record<'ADMIN' | 'APPROVER' | 'USER', string> = {
    ADMIN: 'Administrador',
    APPROVER: 'Aprovador',
    USER: 'Colaborador',
  };

  return <Badge variant={variants[role]} size="sm">{labels[role]}</Badge>;
}

export function StatusBadge({
  status,
}: {
  status: 'DRAFT' | 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'REJECTED' | 'PUBLISHED' | 'ARCHIVED' | 'READY' | 'PENDING' | 'FAILED';
}) {
  const variants: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
    DRAFT: 'default',
    IN_REVIEW: 'primary',
    CHANGES_REQUESTED: 'warning',
    REJECTED: 'danger',
    PUBLISHED: 'success',
    ARCHIVED: 'info',
    READY: 'success',
    PENDING: 'warning',
    FAILED: 'danger',
  };

  const labels: Record<string, string> = {
    DRAFT: 'Rascunho',
    IN_REVIEW: 'Em revisão',
    CHANGES_REQUESTED: 'Ajustes solicitados',
    REJECTED: 'Rejeitado',
    PUBLISHED: 'Publicado',
    ARCHIVED: 'Arquivado',
    READY: 'Pronto',
    PENDING: 'Pendente',
    FAILED: 'Falha',
  };

  return <Badge variant={variants[status] || 'default'} size="sm">{labels[status] || status}</Badge>;
}
