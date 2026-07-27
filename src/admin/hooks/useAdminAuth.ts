import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../auth/hooks/useAuth';
import { checkAdminStatus } from '../services/adminAuth';
import type { AdminAuthState, AdminProfile } from '../types';

export function useAdminAuth(): AdminAuthState & {
  hasPermission: (perm: string) => boolean;
  refresh: () => Promise<void>;
} {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [state, setState] = useState<AdminAuthState>({
    isAdmin: false,
    isSuperAdmin: false,
    profile: null,
    permissions: [],
    loading: true,
    error: null,
  });
  const fetchedRef = useRef(false);

  const fetch = useCallback(async () => {
    if (!isAuthenticated) {
      setState({
        isAdmin: false,
        isSuperAdmin: false,
        profile: null,
        permissions: [],
        loading: false,
        error: null,
      });
      return;
    }

    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const data = await checkAdminStatus();
      setState({
        isAdmin: true,
        isSuperAdmin: data.profile.role === 'super_admin',
        profile: data.profile as AdminProfile,
        permissions: data.permissions,
        loading: false,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to verify admin status';
      setState({
        isAdmin: false,
        isSuperAdmin: false,
        profile: null,
        permissions: [],
        loading: false,
        error: message,
      });
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (authLoading) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch();
  }, [authLoading, fetch]);

  const hasPermission = useCallback(
    (perm: string): boolean => {
      if (state.isSuperAdmin) return true;
      return state.permissions.includes(perm);
    },
    [state.isSuperAdmin, state.permissions],
  );

  const refresh = useCallback(async () => {
    fetchedRef.current = false;
    await fetch();
  }, [fetch]);

  return {
    ...state,
    hasPermission,
    refresh,
  };
}
