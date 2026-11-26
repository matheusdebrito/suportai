import { useCallback, useState, useEffect } from 'react';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

interface UseApiResult<T, Args extends unknown[]> extends UseApiState<T> {
  execute: (...args: Args) => Promise<T | null>;
  reset: () => void;
}

export function useApi<T, Args extends unknown[]>(
  apiFn: (...args: Args) => Promise<T>
): UseApiResult<T, Args> {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(
    async (...args: Args): Promise<T | null> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await apiFn(...args);
        setState({ data, loading: false, error: null });
        return data;
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Erro desconhecido');
        setState({ data: null, loading: false, error: err });
        return null;
      }
    },
    [apiFn]
  );

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return { ...state, execute, reset };
}

export function useAsyncEffect(effect: () => Promise<void>, deps: React.DependencyList) {
  useEffect(() => {
    let mounted = true;
    effect().catch((error) => {
      if (mounted) {
        console.error('Async effect error:', error);
      }
    });
    return () => {
      mounted = false;
    };
  }, deps);
}