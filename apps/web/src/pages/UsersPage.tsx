import { useState, useCallback, useEffect, FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAdmin } from '../hooks/useAdmin';
import { useSpaces } from '../hooks/useSpaces';
import { UsersManagement } from '../components/admin/UsersManagement';
import { Loader } from '../components/ui/Loader';

export function UsersPage() {
  const { user } = useAuth();
  const {
    users,
    loading: usersLoading,
    fetchUsers,
    departments,
    loading: deptsLoading,
    fetchDepartments,
    operations,
    loading: opsLoading,
    fetchOperations,
    createUser,
    updateUser,
    resetUserPassword,
    assignDepartments,
    grantPermission,
  } = useAdmin();
  const { spaces, fetchSpaces } = useSpaces();

  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'USER' | 'APPROVER' | 'ADMIN'>('USER');
  const [tempResetToken, setTempResetToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    fetchUsers();
    fetchDepartments();
    fetchSpaces();
    fetchOperations();
  }, [fetchUsers, fetchDepartments, fetchSpaces, fetchOperations]);

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await createUser(newEmail, newRole);
      setTempResetToken(r.resetToken);
      setNewEmail('');
      fetchUsers();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (id === user?.id) return;
    if (!window.confirm('Desativar permanentemente este usuário? Esta ação não pode ser desfeita.')) return;
    try {
      await updateUser(id, { active: false });
      fetchUsers();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <UsersManagement
      users={users}
      departments={departments}
      spaces={spaces}
      currentUserId={user?.id || ''}
      loading={usersLoading}
      onCreateUser={handleCreateUser}
      onUpdateUser={updateUser}
      onResetPassword={resetUserPassword}
      onAssignDepartments={assignDepartments}
      onGrantPermission={grantPermission}
      onDeleteUser={handleDeleteUser}
      tempResetToken={tempResetToken}
      setTempResetToken={setTempResetToken}
    />
  );
}
