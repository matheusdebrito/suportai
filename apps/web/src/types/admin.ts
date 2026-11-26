import type { UserRole } from './index';
import type { OperationsData } from './index';

export interface AdminUser {
  id: string;
  email: string;
  role: UserRole;
  active: boolean;
  must_change_password: boolean;
  auth_revision: number;
  department_ids: string[];
  created_at: string;
}

export interface Department {
  id: string;
  name: string;
  active: boolean;
  members: number;
  created_at: string;
}

export interface SpaceGrant {
  user_id: string;
  space_id: string;
  can_read: boolean;
  can_edit: boolean;
  can_approve: boolean;
}

export type GrantMode = 'READ' | 'EDIT' | 'APPROVE' | 'NONE';

export interface GrantOption {
  space_id: string;
  space_name: string;
  mode: GrantMode;
  label: string;
}

export interface CreateUserRequest {
  email: string;
  role: UserRole;
}

export interface UpdateUserRequest {
  active?: boolean;
  role?: UserRole;
}

export interface CreateDepartmentRequest {
  name: string;
}

export interface UpdateDepartmentRequest {
  name?: string;
  active?: boolean;
}

export interface AssignDepartmentsRequest {
  department_ids: string[];
}

export interface GrantRequest {
  user_id: string;
  read: boolean;
  edit: boolean;
  approve: boolean;
}

export type { OperationsData };