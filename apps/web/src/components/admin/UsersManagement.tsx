import { useState, FormEvent } from 'react';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/format';
import { Plus, RotateCcw, User, MoreHorizontal, Trash2, UserCheck, UserX, Shield, Key } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Badge, RoleBadge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { DropdownMenuRoot as DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../ui/DropdownMenu';
import type { AdminUser, Department, Space } from '@/types';

interface UsersManagementProps {
  users: AdminUser[];
  departments: Department[];
  spaces: Space[];
  currentUserId: string;
  loading: boolean;
  onCreateUser: (email: string, role: 'USER' | 'APPROVER' | 'ADMIN') => void;
  onUpdateUser: (id: string, updates: { active?: boolean; role?: 'USER' | 'APPROVER' | 'ADMIN' }) => void;
  onResetPassword: (id: string) => void;
  onAssignDepartments: (userId: string, departmentIds: string[]) => void;
  onGrantPermission: (userId: string, spaceId: string, mode: 'READ' | 'EDIT' | 'APPROVE' | 'NONE') => void;
  onDeleteUser: (id: string) => void;
  tempResetToken?: string;
  setTempResetToken: (token: string | undefined) => void;
}

export function UsersManagement({
  users,
  departments,
  spaces,
  currentUserId,
  loading,
  onCreateUser,
  onUpdateUser,
  onResetPassword,
  onAssignDepartments,
  onGrantPermission,
  onDeleteUser,
  tempResetToken,
  setTempResetToken,
}: UsersManagementProps) {
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'USER' | 'APPROVER' | 'ADMIN'>('USER');
  const [emailError, setEmailError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState<{ user: AdminUser } | null>(null);
  const [showGrantModal, setShowGrantModal] = useState<{ user: AdminUser; space: Space } | null>(null);
  const [grantMode, setGrantMode] = useState<'READ' | 'EDIT' | 'APPROVE' | 'NONE'>('READ');

  const handleCreateUser = (e: FormEvent) => {
    e.preventDefault();
    setEmailError('');

    if (!newEmail.trim()) {
      setEmailError('E-mail é obrigatório');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setEmailError('E-mail inválido');
      return;
    }

    onCreateUser(newEmail, newRole);
    setNewEmail('');
  };

  const handleRoleChange = (userId: string, role: 'USER' | 'APPROVER' | 'ADMIN') => {
    onUpdateUser(userId, { role });
  };

  const handleActiveToggle = (user: AdminUser) => {
    onUpdateUser(user.id, { active: !user.active });
  };

  const handleDepartmentChange = (userId: string, e: React.ChangeEvent<HTMLSelectElement>) => {
    const departmentIds = Array.from(e.currentTarget.selectedOptions).map((opt) => opt.value);
    onAssignDepartments(userId, departmentIds);
  };

  const handleGrantPermission = () => {
    if (showGrantModal) {
      onGrantPermission(showGrantModal.user.id, showGrantModal.space.id, grantMode);
      setShowGrantModal(null);
    }
  };

  const handleDeleteConfirm = () => {
    if (showDeleteModal) {
      onDeleteUser(showDeleteModal.user.id);
      setShowDeleteModal(null);
    }
  };

  const grantOptions = spaces.flatMap((space) => [
    { spaceId: space.id, mode: 'READ' as const, label: `${space.name} — Somente leitura` },
    { spaceId: space.id, mode: 'EDIT' as const, label: `${space.name} — Leitura e edição` },
    { spaceId: space.id, mode: 'APPROVE' as const, label: `${space.name} — Leitura, edição e aprovação` },
    { spaceId: space.id, mode: 'NONE' as const, label: `${space.name} — Revogar acesso` },
  ]);

  return (
    <div className="space-y-6">
      <section className="border border-surface-200 rounded-xl p-6 bg-white">
        <h2 className="text-lg font-semibold text-surface-900 mb-4">Cadastrar colaborador</h2>
        <form onSubmit={handleCreateUser} className="space-y-4 max-w-md">
          <Input
            label="E-mail"
            type="email"
            value={newEmail}
            onChange={(e) => { setNewEmail(e.target.value); setEmailError(''); }}
            required
            error={emailError}
            placeholder="colaborador@empresa.com"
          />
          <Select
            label="Perfil"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as 'USER' | 'APPROVER' | 'ADMIN')}
            options={[
              { value: 'USER', label: 'Colaborador' },
              { value: 'APPROVER', label: 'Aprovador de conhecimento' },
              { value: 'ADMIN', label: 'Administrador' },
            ]}
          />
          <Button type="submit" className="w-full" loading={loading}>
            <Plus className="h-4 w-4 mr-2" /> Criar usuário
          </Button>
        </form>

        {tempResetToken && (
          <div className="mt-4 p-4 rounded-lg bg-amber-50 border border-amber-200 animate-in">
            <div className="flex items-center justify-between mb-2">
              <strong className="text-amber-800">Código temporário (visível apenas agora)</strong>
              <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(tempResetToken)}>
                Copiar
              </Button>
            </div>
            <code className="text-lg font-mono text-amber-900 break-all">{tempResetToken}</code>
            <p className="mt-2 text-sm text-amber-700">Entregue ao usuário por canal seguro. Válido por 15 minutos.</p>
            <Button variant="ghost" size="sm" onClick={() => setTempResetToken(undefined)} className="mt-2">
              Dispensar
            </Button>
          </div>
        )}
      </section>

      <section className="border border-surface-200 rounded-xl bg-white overflow-hidden">
        <div className="p-4 border-b border-surface-200">
          <h2 className="text-lg font-semibold text-surface-900">Usuários ({users.length})</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">Usuário</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">Perfil</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">Departamentos</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {users.map((user) => (
                <tr key={user.id} className={cn('hover:bg-surface-50', user.id === currentUserId && 'bg-primary-50/50')}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                        <User className="h-4 w-4 text-primary-600" />
                      </div>
                      <div>
                        <p className="font-medium text-surface-900">{user.email}</p>
                        <p className="text-xs text-surface-500">ID: {user.id.slice(0, 8)}...</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={user.active ? 'success' : 'danger'} size="sm">
                      {user.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                    {user.mustChangePassword && (
                      <Badge variant="warning" size="sm" className="ml-1">Troca de senha</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.departmentIds.map((deptId) => {
                        const dept = departments.find((d) => d.id === deptId);
                        return dept ? (
                          <Badge key={dept.id} variant={dept.active ? 'default' : 'warning'} size="sm">
                            {dept.name}{!dept.active && ' (inativo)'}
                          </Badge>
                        ) : null;
                      })}
                      {user.departmentIds.length === 0 && (
                        <span className="text-xs text-surface-400">Nenhum</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Ações para ${user.email}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem
                          onSelect={() => handleRoleChange(user.id, 'USER')}
                          disabled={user.role === 'USER' || user.id === currentUserId}
                        >
                          <User className="h-4 w-4" /> Definir como Colaborador
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => handleRoleChange(user.id, 'APPROVER')}
                          disabled={user.role === 'APPROVER' || user.id === currentUserId}
                        >
                          <Shield className="h-4 w-4" /> Definir como Aprovador
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => handleRoleChange(user.id, 'ADMIN')}
                          disabled={user.role === 'ADMIN' || user.id === currentUserId}
                        >
                          <Shield className="h-4 w-4" /> Definir como Administrador
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => onResetPassword(user.id)} disabled={user.id === currentUserId}>
                          <Key className="h-4 w-4" /> Redefinir senha
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => handleActiveToggle(user)}
                          disabled={user.id === currentUserId}
                        >
                          {user.active ? (
                            <>
                              <UserX className="h-4 w-4" /> Desativar
                            </>
                          ) : (
                            <>
                              <UserCheck className="h-4 w-4" /> Ativar
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => {
                            const userSpace = spaces[0];
                            if (userSpace) setShowGrantModal({ user, space: userSpace });
                          }}
                        >
                          <Shield className="h-4 w-4" /> Permissões de espaço
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setShowDeleteModal({ user })}
                          disabled={user.id === currentUserId}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4" /> Remover (desativar permanentemente)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {users.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-surface-500">Nenhum usuário cadastrado.</p>
          </div>
        )}
      </section>

      <Modal
        open={!!showDeleteModal}
        onOpenChange={setShowDeleteModal}
        title="Confirmar remoção"
        description={`Tem certeza que deseja desativar permanentemente ${showDeleteModal?.user.email}? Esta ação não pode ser desfeita.`}
        confirmText="Remover"
        cancelText="Cancelar"
        onConfirm={handleDeleteConfirm}
        variant="danger"
      />

      <Modal
        open={!!showGrantModal}
        onOpenChange={setShowGrantModal}
        title="Alterar permissão"
        description={`Conceder acesso para ${showGrantModal?.user.email} no espaço ${showGrantModal?.space.name}`}
        confirmText="Aplicar"
        cancelText="Cancelar"
        onConfirm={handleGrantPermission}
      >
        <Select
          label="Permissão"
          value={grantMode}
          onChange={(e) => setGrantMode(e.target.value as 'READ' | 'EDIT' | 'APPROVE' | 'NONE')}
          options={[
            { value: 'READ', label: 'Somente leitura' },
            { value: 'EDIT', label: 'Leitura e edição' },
            { value: 'APPROVE', label: 'Leitura, edição e aprovação' },
            { value: 'NONE', label: 'Revogar acesso' },
          ]}
        />
      </Modal>
    </div>
  );
}
