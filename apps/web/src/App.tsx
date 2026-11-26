import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastProvider } from './components/ui/Toast';
import { Layout, AuthLayout } from './components/layout/Layout';
import { LoginForm } from './components/auth/LoginForm';
import { ChangePasswordForm } from './components/auth/ChangePasswordForm';
import { ChatPage } from './pages/ChatPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { ReviewsPage } from './pages/ReviewsPage';
import { UsersPage } from './pages/UsersPage';
import { DepartmentsPage } from './pages/DepartmentsPage';
import { OperationsPage } from './pages/OperationsPage';
import { Loader } from './components/ui/Loader';

function PrivateRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: ('ADMIN' | 'APPROVER' | 'USER')[] }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <Loader size="lg" text="Carregando..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/chat" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <Loader size="lg" text="Carregando..." />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/chat" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <Loader size="lg" text="Carregando..." />
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<PublicRoute><LoginForm /></PublicRoute>} />
        <Route path="/change-password" element={<PublicRoute><ChangePasswordForm /></PublicRoute>} />
      </Route>

      <Route element={<Layout />}>
        <Route path="/chat" element={<PrivateRoute><ChatPage /></PrivateRoute>} />
        <Route path="/knowledge" element={<PrivateRoute><KnowledgePage /></PrivateRoute>} />
        <Route path="/reviews" element={<PrivateRoute allowedRoles={['APPROVER', 'ADMIN']}><ReviewsPage /></PrivateRoute>} />
        <Route path="/management/users" element={<PrivateRoute allowedRoles={['ADMIN']}><UsersPage /></PrivateRoute>} />
        <Route path="/management/departments" element={<PrivateRoute allowedRoles={['ADMIN']}><DepartmentsPage /></PrivateRoute>} />
        <Route path="/management/operations" element={<PrivateRoute allowedRoles={['ADMIN']}><OperationsPage /></PrivateRoute>} />
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
