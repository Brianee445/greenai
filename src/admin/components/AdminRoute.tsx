import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { AuthLoadingScreen } from '../../auth/components/AuthLoadingScreen';
import type { ReactNode } from 'react';

interface AdminRouteProps {
  children: ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { isAdmin, loading } = useAdminAuth();

  if (loading) return <AuthLoadingScreen />;
  if (!isAdmin) return <Navigate to="/ops/login" replace />;
  return <>{children}</>;
}
