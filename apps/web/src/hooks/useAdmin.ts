import { useCallback } from 'react';
import { useApi } from './useApi';
import { adminApi } from '../api/client';
import type { AdminUser, Department, OperationsData, CreateUserRequest, UpdateUserRequest, CreateDepartmentRequest, UpdateDepartmentRequest, AssignDepartmentsRequest, GrantRequest } from '../types/admin';

export function useUsers() {
  const { data, loading, error, execute: fetchUsers, reset } = useApi(adminApi.listUsers);

  return {
    users: data?.users ?? [],
    loading,
    error,
    fetchUsers,
    reset,
  };
}

export function useDepartments() {
  const { data, loading, error, execute: fetchDepartments, reset } = useApi(adminApi.listDepartments);

  return {
    departments: data?.departments ?? [],
    loading,
    error,
    fetchDepartments,
    reset,
  };
}

export function useOperations() {
  const { data, loading, error, execute: fetchOperations, reset } = useApi(adminApi.getOperations);

  return {
    operations: data ?? null,
    loading,
    error,
    fetchOperations,
    reset,
  };
}

export function useAdminActions() {
  const createUser = useApi(adminApi.createUser);
  const updateUser = useApi(adminApi.updateUser);
  const resetUserPassword = useApi(adminApi.resetUserPassword);
  const assignDepartments = useApi(adminApi.assignDepartments);
  const createDepartment = useApi(adminApi.createDepartment);
  const updateDepartment = useApi(adminApi.updateDepartment);
  const grantPermission = useApi(adminApi.grantPermission);

  return {
    createUser,
    updateUser,
    resetUserPassword,
    assignDepartments,
    createDepartment,
    updateDepartment,
    grantPermission,
  };
}

export function useAdmin() {
  const users = useUsers();
  const departments = useDepartments();
  const operations = useOperations();
  const actions = useAdminActions();

  return {
    ...users,
    ...departments,
    ...operations,
    ...actions,
  };
}