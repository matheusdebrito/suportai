import { useCallback } from 'react';
import { useApi } from './useApi';
import { spacesApi } from '../api/client';
import type { Space } from '../types';

export function useSpaces() {
  const { data, loading, error, execute: fetchSpaces, reset } = useApi(spacesApi.list);

  const getEditableSpaces = useCallback((): Space[] => {
    return data?.spaces.filter((s) => s.can_edit) ?? [];
  }, [data]);

  const getApprovableSpaces = useCallback((): Space[] => {
    return data?.spaces.filter((s) => s.can_approve) ?? [];
  }, [data]);

  const getReadableSpaces = useCallback((): Space[] => {
    return data?.spaces.filter((s) => s.can_read) ?? [];
  }, [data]);

  const findSpace = useCallback(
    (id: string): Space | undefined => {
      return data?.spaces.find((s) => s.id === id);
    },
    [data]
  );

  return {
    spaces: data?.spaces ?? [],
    loading,
    error,
    fetchSpaces,
    reset,
    getEditableSpaces,
    getApprovableSpaces,
    getReadableSpaces,
    findSpace,
  };
}