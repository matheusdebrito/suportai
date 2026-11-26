import { useState, FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { BrainCircuit } from 'lucide-react';

export function ChangePasswordForm() {
  const { changePassword } = useAuth();
  const navigate = useNavigate();
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('As senhas não conferem');
      return;
    }

    const validationError = validatePassword(newPassword);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!resetToken.trim()) {
      setError('Código temporário é obrigatório');
      return;
    }

    setLoading(true);

    try {
      await changePassword(resetToken, newPassword);
      navigate('/chat');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao alterar senha');
    } finally {
      setLoading(false);
    }
  };

  function validatePassword(password: string): string | null {
    if (password.length < 12) return 'Senha deve ter no mínimo 12 caracteres';
    if (password.length > 256) return 'Senha muito longa (máx. 256 caracteres)';
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface-50">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl border border-surface-200 shadow-sm p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary-600 mx-auto mb-4">
              <BrainCircuit className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-surface-900">Troca de senha obrigatória</h1>
            <p className="mt-2 text-surface-500">Utilize o código temporário fornecido pelo administrador.</p>
          </div>

          {error && (
            <div className="mb-6 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Código temporário"
              type="text"
              value={resetToken}
              onChange={(e) => setResetToken(e.target.value)}
              required
              autoComplete="one-time-code"
              placeholder="Código de 15 minutos"
            />

            <Input
              label="Nova senha"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={12}
              placeholder="Mínimo 12 caracteres"
              hint="Use uma senha forte e única"
            />

            <Input
              label="Confirmar nova senha"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="Repita a nova senha"
            />

            <Button type="submit" className="w-full" size="lg" loading={loading}>
              Alterar senha
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
