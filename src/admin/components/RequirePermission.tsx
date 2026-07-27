import { useAdminAuth } from '../hooks/useAdminAuth';
import type { ReactNode } from 'react';

interface RequirePermissionProps {
  permission: string;
  fallback?: ReactNode;
  children: ReactNode;
}

export function RequirePermission({ permission, fallback, children }: RequirePermissionProps) {
  const { hasPermission } = useAdminAuth();

  if (!hasPermission(permission)) {
    return fallback ?? null;
  }

  return <>{children}</>;
}
