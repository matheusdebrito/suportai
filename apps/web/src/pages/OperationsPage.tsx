import { useCallback, useEffect } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { OperationsDashboard } from '../components/admin/OperationsDashboard';

export function OperationsPage() {
  const {
    operations,
    loading,
    fetchOperations,
  } = useAdmin();

  useEffect(() => {
    fetchOperations();
  }, [fetchOperations]);

  return (
    <OperationsDashboard
      operations={operations}
      loading={loading}
      onRefresh={fetchOperations}
    />
  );
}
