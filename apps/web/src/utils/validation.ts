export function validateEmail(email: string): string | null {
  if (!email) return 'E-mail é obrigatório';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return 'E-mail inválido';
  if (email.length > 254) return 'E-mail muito longo (máx. 254 caracteres)';
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Senha é obrigatória';
  if (password.length < 12) return 'Senha deve ter no mínimo 12 caracteres';
  if (password.length > 256) return 'Senha muito longa (máx. 256 caracteres)';
  return null;
}

export function validateRequired(value: string, fieldName: string): string | null {
  if (!value || !value.trim()) return `${fieldName} é obrigatório`;
  return null;
}

export function validateMinLength(value: string, min: number, fieldName: string): string | null {
  if (value.length < min) return `${fieldName} deve ter no mínimo ${min} caracteres`;
  return null;
}

export function validateMaxLength(value: string, max: number, fieldName: string): string | null {
  if (value.length > max) return `${fieldName} deve ter no máximo ${max} caracteres`;
  return null;
}