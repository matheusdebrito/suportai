import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '\.\.\/\.\.\/utils\/cn';
import {
  MessageCircle,
  BookOpen,
  ShieldCheck,
  Users,
  Building2,
  BarChart3,
} from 'lucide-react';
import type { UserRole } from '\.\.\/\.\.\/types';

interface SidebarProps {
  userRole: UserRole;
}

const navItems = [
  { path: '/chat', label: 'Assistente', icon: MessageCircle, roles: ['ADMIN', 'APPROVER', 'USER'] as UserRole[] },
  { path: '/knowledge', label: 'Conhecimento', icon: BookOpen, roles: ['ADMIN', 'APPROVER', 'USER'] as UserRole[] },
  { path: '/reviews', label: 'Revisão', icon: ShieldCheck, roles: ['APPROVER', 'ADMIN'] as UserRole[] },
  { path: '/management/users', label: 'Usuários', icon: Users, roles: ['ADMIN'] as UserRole[] },
  { path: '/management/departments', label: 'Departamentos', icon: Building2, roles: ['ADMIN'] as UserRole[] },
  { path: '/management/operations', label: 'Operação', icon: BarChart3, roles: ['ADMIN'] as UserRole[] },
] as const;

export function Sidebar({ userRole }: SidebarProps) {
  const location = useLocation();

  const filteredItems = navItems.filter((item) => item.roles.includes(userRole));

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-surface-200 flex flex-col z-40">
      <div className="flex items-center gap-2 p-4 border-b border-surface-200">
        <div className="p-2 rounded-lg bg-primary-600">
          <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>
        <span className="font-semibold text-surface-900 text-lg">SuportAI</span>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto" role="navigation" aria-label="Navegação principal">
        {filteredItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-fast',
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900'
              )
            }
          >
            <item.icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-surface-200">
        <p className="text-xs text-surface-400 text-center">
          SuportAI v0.1.0
        </p>
      </div>
    </aside>
  );
}
