import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  toast: (options: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((options: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2, 9);
    const newToast: Toast = { ...options, id, duration: options.duration ?? 5000 };
    setToasts((prev) => [...prev, newToast]);
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => dismiss(id), newToast.duration);
    }
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  const icons = {
    success: <CheckCircle className="h-5 w-5 text-green-500" />,
    error: <AlertCircle className="h-5 w-5 text-red-500" />,
    info: <Info className="h-5 w-5 text-blue-500" />,
    warning: <AlertCircle className="h-5 w-5 text-yellow-500" />,
  };

  const bgColors = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    info: 'bg-blue-50 border-blue-200',
    warning: 'bg-yellow-50 border-yellow-200',
  };

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-start gap-3 p-4 rounded-lg border shadow-lg animate-in slide-in-from-right',
            bgColors[t.type]
          )}
          role="alert"
        >
          {icons[t.type]}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-surface-900">{t.title}</p>
            {t.message && <p className="mt-0.5 text-sm text-surface-600">{t.message}</p>}
          </div>
          <button
            onClick={() => onDismiss(t.id)}
            className="p-1 rounded text-surface-400 hover:text-surface-600 transition-fast"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function toastSuccess(title: string, message?: string) {
  // This is a placeholder - actual usage requires useToast hook
  console.log('toastSuccess', title, message);
}

export function toastError(title: string, message?: string) {
  console.log('toastError', title, message);
}

export function toastInfo(title: string, message?: string) {
  console.log('toastInfo', title, message);
}
