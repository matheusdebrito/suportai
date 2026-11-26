import { useAuth } from '../../hooks/useAuth';
import { cn } from '\.\.\/\.\.\/utils\/cn';
import { LogOut, User, Menu } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../../components/ui/DropdownMenu';
import { Button } from '../../components/ui/Button';
import { Badge, RoleBadge } from '../../components/ui/Badge';

export function Header() {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="fixed left-64 right-0 top-0 h-16 bg-white border-b border-surface-200 flex items-center justify-between px-4 z-30">
      <div className="flex items-center gap-4">
        <button
          className="lg:hidden p-2 rounded-lg hover:bg-surface-100 transition-fast"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Abrir menu"
          aria-expanded={mobileMenuOpen}
        >
          <Menu className="h-6 w-6 text-surface-600" />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-end gap-4">
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-surface-100 transition-fast">
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                  <span className="text-sm font-medium text-primary-700">
                    {user.email.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-medium text-surface-900 truncate max-w-[160px]">
                    {user.email}
                  </p>
                  <RoleBadge role={user.role} />
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-3 py-2 border-b border-surface-200">
                <p className="text-sm font-medium text-surface-900">{user.email}</p>
                <RoleBadge role={user.role} />
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => logout()}>
                <LogOut className="h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
