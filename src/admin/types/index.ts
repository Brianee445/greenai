export type AdminRole = 'super_admin' | 'admin';

export interface AdminProfile {
  id: string;
  email: string;
  role: AdminRole;
  display_name: string | null;
}

export interface AdminAuthState {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  profile: AdminProfile | null;
  permissions: string[];
  loading: boolean;
  error: string | null;
}

export const PERMISSIONS = {
  USERS_VIEW: 'users.view',
  USERS_BAN: 'users.ban',
  USERS_UNBAN: 'users.unban',
  USERS_UPGRADE: 'users.upgrade',
  USERS_DOWNGRADE: 'users.downgrade',
  PAYMENTS_VIEW: 'payments.view',
  SUBSCRIPTIONS_MANAGE: 'subscriptions.manage',
  ANALYTICS_VIEW: 'analytics.view',
  AUDIT_LOGS_VIEW: 'audit_logs.view',
  FEATURE_FLAGS_MANAGE: 'feature_flags.manage',
  SYSTEM_VIEW: 'system.view',
  PLANS_MANAGE: 'plans.manage',
  PERMISSIONS_MANAGE: 'permissions.manage',
  ADMINS_INVITE: 'admins.invite',
  ADMINS_REMOVE: 'admins.remove',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
