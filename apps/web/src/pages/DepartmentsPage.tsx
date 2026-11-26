import { useCallback, useEffect } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { DepartmentManagement } from '../components/admin/DepartmentManagement';

export function DepartmentsPage() {
  const {
    departments,
    loading,
    fetchDepartments,
    createDepartment,
    updateDepartment,
  } = useAdmin();

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  return (
    <DepartmentManagement
      departments={departments}
      loading={loading}
      onCreate={createDepartment}
      onUpdate={updateDepartment}
    />
  );
}
