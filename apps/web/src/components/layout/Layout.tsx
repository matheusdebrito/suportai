import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '../../hooks/useAuth';
import { cn } from '\.\.\/\.\.\/utils\/cn';

export function Layout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Sidebar userRole={user.role} />
      <Header />
      <main className={cn('pt-16 lg:pl-64 min-h-screen transition-all duration-200')}>
        <div className="p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
      <Outlet />
    </div>
  );
}
