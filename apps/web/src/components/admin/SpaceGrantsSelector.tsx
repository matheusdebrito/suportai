import { cn } from '@/utils/cn';
import { Shield, Key, User, Eye, Edit, Check } from 'lucide-react';
import { Badge } from '../ui/Badge';
import type { Space } from '@/types';

interface SpaceGrantsSelectorProps {
  spaces: Space[];
  userId: string;
  currentUserId: string;
  onGrant: (spaceId: string, mode: 'READ' | 'EDIT' | 'APPROVE' | 'NONE') => void;
  disabled?: boolean;
}

const grantModes = [
  { value: 'READ', label: 'Somente leitura', icon: Eye, color: 'blue', description: 'Pode visualizar documentos publicados' },
  { value: 'EDIT', label: 'Leitura e edição', icon: Edit, color: 'yellow', description: 'Pode criar e editar rascunhos' },
  { value: 'APPROVE', label: 'Leitura, edição e aprovação', icon: Shield, color: 'green', description: 'Pode revisar e publicar conteúdos' },
  { value: 'NONE', label: 'Revogar acesso', icon: User, color: 'red', description: 'Remove todas as permissões neste espaço' },
] as const;

export function SpaceGrantsSelector({
  spaces,
  userId,
  currentUserId,
  onGrant,
  disabled,
}: SpaceGrantsSelectorProps) {
  if (spaces.length === 0) return null;

  return (
    <label className="block">
      <span className="block text-sm font-medium text-surface-700 mb-2">Alterar permissões do conhecimento</span>
      <select
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) {
            const [spaceId, mode] = e.target.value.split('|');
            onGrant(spaceId, mode as 'READ' | 'EDIT' | 'APPROVE' | 'NONE');
          }
          e.target.value = '';
        }}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-lg border border-surface-300 bg-white text-surface-900 focus-ring appearance-none cursor-pointer disabled:bg-surface-50 disabled:cursor-not-allowed"
      >
        <option value="" disabled>
          Selecionar espaço e permissão...
        </option>
        {spaces.flatMap((space) =>
          grantModes.map((mode) => (
            <option key={`${space.id}-${mode.value}`} value={`${space.id}|${mode.value}`}>
              {space.name} — {mode.label}
            </option>
          ))
        )}
      </select>
    </label>
  );
}
