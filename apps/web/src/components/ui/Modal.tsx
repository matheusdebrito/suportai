import * as Dialog from '@radix-ui/react-dialog';
import { forwardRef, ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl',
};

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  size = 'md',
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in z-50" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl',
            'animate-in fade-in zoom-in-95',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out data-[state=closed]:zoom-out-95',
            'w-full max-h-[90vh] overflow-hidden',
            sizes[size],
            className
          )}
        >
          {(title || description) && (
            <div className="flex items-start justify-between p-4 border-b border-surface-200">
              <div>
                {title && (
                  <Dialog.Title className="text-lg font-semibold text-surface-900">{title}</Dialog.Title>
                )}
                {description && (
                  <Dialog.Description className="mt-1 text-sm text-surface-500">{description}</Dialog.Description>
                )}
              </div>
              <Dialog.Close
                className="p-1 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-fast"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>
          )}
          <div className="p-4 overflow-y-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  variant?: 'danger' | 'primary';
  loading?: boolean;
}

export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  onConfirm,
  variant = 'danger',
  loading,
}: AlertDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl animate-in fade-in zoom-in-95 max-w-md w-full mx-4">
          <div className="p-4 border-b border-surface-200">
            <Dialog.Title className="text-lg font-semibold text-surface-900">{title}</Dialog.Title>
            {description && (
              <Dialog.Description className="mt-1 text-sm text-surface-500">{description}</Dialog.Description>
            )}
          </div>
          <div className="p-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-surface-300 text-surface-700 hover:bg-surface-50 transition-fast focus-ring"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={() => { onConfirm(); onOpenChange(false); }}
              disabled={loading}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg transition-fast focus-ring',
                variant === 'danger'
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-primary-600 text-white hover:bg-primary-700'
              )}
            >
              {loading ? 'Aguarde...' : confirmText}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
