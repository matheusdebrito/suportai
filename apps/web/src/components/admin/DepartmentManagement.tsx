import { useState, FormEvent } from 'react';
import { cn } from '@/utils/cn';
import { Plus, RotateCcw, Edit, Trash2, Check, X, UserCheck, UserX } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import type { Department } from '@/types';

interface DepartmentManagementProps {
  departments: Department[];
  loading: boolean;
  onCreate: (name: string) => void;
  onUpdate: (id: string, updates: { name?: string; active?: boolean }) => void;
}

function DepartmentRow({
  dept,
  editingId,
  editName,
  onStartEditing,
  onHandleUpdate,
  onCancelEditing,
  onHandleToggleActive,
}: {
  dept: Department;
  editingId: string | null;
  editName: string;
  onStartEditing: (dept: Department) => void;
  onHandleUpdate: (id: string) => void;
  onCancelEditing: () => void;
  onHandleToggleActive: (dept: Department) => void;
}) {
  if (editingId === dept.id) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); onHandleUpdate(dept.id); }} className="p-4 flex items-center gap-3">
        <Input
          value={editName}
          onChange={(e) => e.target.value} // Note: parent handles this
          required
          minLength={3}
          maxLength={80}
          className="flex-1"
        />
        <Button type="submit" size="sm">
          <Check className="h-4 w-4 mr-1" /> Salvar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancelEditing}>
          <X className="h-4 w-4" /> Cancelar
        </Button>
      </form>
    );
  }

  return (
    <div className="p-4 flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <span className="font-medium text-surface-900 truncate">{dept.name}</span>
          <Badge variant={dept.active ? 'success' : 'danger'} size="sm">
            {dept.active ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
        <p className="text-sm text-surface-500 mt-1">{dept.members} colaborador(es)</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={() => onStartEditing(dept)}>
          <Edit className="h-4 w-4" /> Editar
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onHandleToggleActive(dept)}>
          {dept.active ? 'Desativar' : 'Ativar'}
        </Button>
      </div>
    </div>
  );
}

export function DepartmentManagement({
  departments,
  loading,
  onCreate,
  onUpdate,
}: DepartmentManagementProps) {
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [nameError, setNameError] = useState('');

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    setNameError('');

    if (!name.trim()) {
      setNameError('Nome é obrigatório');
      return;
    }
    if (name.trim().length < 3) {
      setNameError('Nome deve ter no mínimo 3 caracteres');
      return;
    }
    if (name.trim().length > 80) {
      setNameError('Nome deve ter no máximo 80 caracteres');
      return;
    }

    onCreate(name.trim());
    setName('');
  };

  const handleUpdate = (id: string) => {
    if (!editName.trim()) return;
    onUpdate(id, { name: editName.trim() });
    setEditingId(null);
    setEditName('');
  };

  const handleToggleActive = (dept: Department) => {
    onUpdate(dept.id, { active: !dept.active });
  };

  const startEditing = (dept: Department) => {
    setEditingId(dept.id);
    setEditName(dept.name);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
  };

  const handleEditNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditName(e.target.value);
  };

  return (
    <section className="border border-surface-200 rounded-xl p-6 bg-white">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-surface-900">Departamentos</h2>
        <p className="text-sm text-surface-500">O vínculo com um departamento não concede acesso a conteúdo restrito.</p>
      </div>

      <form onSubmit={handleCreate} className="mb-6 max-w-md">
        <Input
          label="Nome do departamento"
          value={name}
          onChange={(e) => { setName(e.target.value); setNameError(''); }}
          required
          minLength={3}
          maxLength={80}
          error={nameError}
          placeholder="Ex: Tecnologia da Informação"
        />
        <div className="mt-4 flex gap-2">
          <Button type="submit" loading={loading}>
            <Plus className="h-4 w-4 mr-2" /> Criar departamento
          </Button>
        </div>
      </form>

      <div className="space-y-3">
        {departments.length === 0 ? (
          <div className="p-6 text-center border border-surface-200 rounded-lg">
            <p className="text-surface-500">Nenhum departamento cadastrado.</p>
          </div>
        ) : (
          departments.map((dept) => (
            <div key={dept.id} className="border border-surface-200 rounded-lg overflow-hidden">
              {editingId === dept.id ? (
                <form onSubmit={(e) => { e.preventDefault(); handleUpdate(dept.id); }} className="p-4 flex items-center gap-3">
                  <Input
                    value={editName}
                    onChange={handleEditNameChange}
                    required
                    minLength={3}
                    maxLength={80}
                    className="flex-1"
                  />
                  <Button type="submit" size="sm">
                    <Check className="h-4 w-4 mr-1" /> Salvar
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={cancelEditing}>
                    <X className="h-4 w-4" /> Cancelar
                  </Button>
                </form>
              ) : (
                <DepartmentRow
                  dept={dept}
                  editingId={editingId}
                  editName={editName}
                  onStartEditing={startEditing}
                  onHandleUpdate={handleUpdate}
                  onCancelEditing={cancelEditing}
                  onHandleToggleActive={handleToggleActive}
                />
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
