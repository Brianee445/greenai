-- ─────────────────────────────────────────────────────────────
-- Phase 1: Admin Infrastructure
-- Adds RBAC columns, feature_flags, admin_audit_logs,
-- updates RLS policies, and bootstraps the Super Admin
-- ─────────────────────────────────────────────────────────────

-- ══════════════════════════════════════
-- 1. Add RBAC columns to profiles
--    Guarded: creates table if missing,
--    then adds columns idempotently.
-- ══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin')),
  display_name TEXT,
  banned_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  ban_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns in case table already existed without them
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role') THEN
    ALTER TABLE public.profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'display_name') THEN
    ALTER TABLE public.profiles ADD COLUMN display_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'banned_at') THEN
    ALTER TABLE public.profiles ADD COLUMN banned_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'suspended_at') THEN
    ALTER TABLE public.profiles ADD COLUMN suspended_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'ban_reason') THEN
    ALTER TABLE public.profiles ADD COLUMN ban_reason TEXT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Safe to call even if already enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════
-- 2. Feature Flags
-- ══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key TEXT NOT NULL UNIQUE,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  target_type TEXT NOT NULL DEFAULT 'global'
    CHECK (target_type IN ('global', 'user', 'plan', 'beta')),
  target_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON public.feature_flags(flag_key);
CREATE INDEX IF NOT EXISTS idx_feature_flags_target ON public.feature_flags(target_type, target_id);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read feature flags" ON public.feature_flags;
CREATE POLICY "Admins can read feature flags"
  ON public.feature_flags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can insert feature flags" ON public.feature_flags;
CREATE POLICY "Admins can insert feature flags"
  ON public.feature_flags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can update feature flags" ON public.feature_flags;
CREATE POLICY "Admins can update feature flags"
  ON public.feature_flags FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

-- ══════════════════════════════════════
-- 3. Admin Audit Logs (immutable)
-- ══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read audit logs (SELECT only — never update/delete)
DROP POLICY IF EXISTS "Admins can read audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can read audit logs"
  ON public.admin_audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

-- No INSERT/UPDATE/DELETE policies for regular auth — only service_role via edge functions

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id ON public.admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON public.admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON public.admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target ON public.admin_audit_logs(target_type, target_id);

-- ══════════════════════════════════════
-- 4. Update profiles RLS policies
-- ══════════════════════════════════════

-- Drop and recreate existing profile policies to include admin access

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Only super_admin can update roles
DROP POLICY IF EXISTS "Super admin can update any profile" ON public.profiles;
CREATE POLICY "Super admin can update any profile"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'super_admin'
    )
  );

-- ══════════════════════════════════════
-- 5. Update handle_new_user trigger to
--    set display_name from email.
--    Also creates the trigger if it
--    doesn't exist (safe if 00001
--    hasn't been run).
-- ══════════════════════════════════════

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)),
    'user'
  );
  RETURN NEW;
END;
$$;

-- ══════════════════════════════════════
-- 6. Bootstrap Super Admin function
--    Usage: SELECT bootstrap_super_admin('email@example.com');
--    Only works if no super_admin exists yet.
-- ══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.bootstrap_super_admin(admin_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_count INTEGER;
BEGIN
  -- Check if any super_admin already exists
  SELECT COUNT(*) INTO v_count
  FROM public.profiles
  WHERE role = 'super_admin';

  IF v_count > 0 THEN
    RETURN 'Super admin already exists. Bootstrap rejected.';
  END IF;

  -- Find the user by email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = admin_email;

  IF v_user_id IS NULL THEN
    RETURN 'User not found with email: ' || admin_email;
  END IF;

  -- Promote to super_admin
  UPDATE public.profiles
  SET role = 'super_admin',
      display_name = COALESCE(display_name, split_part(admin_email, '@', 1)),
      updated_at = now()
  WHERE id = v_user_id;

  RETURN 'Super admin created for: ' || admin_email;
END;
$$;

-- Recreate the trigger (safe even if 00001 created it already)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ══════════════════════════════════════
-- 7. Insert default feature flags
-- ══════════════════════════════════════

INSERT INTO public.feature_flags (flag_key, description, enabled, target_type) VALUES
  ('voice', 'Voice input and voice chat support', false, 'global'),
  ('vision', 'Vision/image analysis capabilities', true, 'global'),
  ('image_generation', 'AI image generation', true, 'global'),
  ('new_models', 'Early access to newest AI models', false, 'beta'),
  ('experimental_features', 'Experimental features for testing', false, 'beta'),
  ('web_search', 'Web search grounding for responses', true, 'global')
ON CONFLICT (flag_key) DO NOTHING;

-- ══════════════════════════════════════
-- 8. Permission system
-- ══════════════════════════════════════

-- Add valid_from and deleted_at to profiles for session revocation & soft delete
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Reference table of all permissions
CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key TEXT NOT NULL UNIQUE,
  description TEXT,
  super_admin_only BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.permissions (permission_key, description, super_admin_only) VALUES
  ('users.view',           'View user profiles and details',            false),
  ('users.ban',            'Ban users',                                false),
  ('users.unban',          'Unban users',                              false),
  ('users.upgrade',        'Upgrade user plans',                       false),
  ('users.downgrade',      'Downgrade user plans',                     false),
  ('payments.view',        'View payment records',                     false),
  ('subscriptions.manage', 'Manage subscriptions',                     false),
  ('analytics.view',       'View analytics dashboards',                false),
  ('audit_logs.view',      'View audit logs',                          false),
  ('feature_flags.manage', 'Manage feature flags',                     true),
  ('system.view',          'View system health',                       false),
  ('plans.manage',         'Manage plans and pricing',                 true),
  ('permissions.manage',   'Manage admin permissions',                 true),
  ('admins.invite',        'Invite new admins',                        true),
  ('admins.remove',        'Remove admins',                            true)
ON CONFLICT (permission_key) DO NOTHING;

-- Join table: which admin has which permission (soft-deletable)
CREATE TABLE IF NOT EXISTS public.admin_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES public.permissions(permission_key),
  granted_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(admin_id, permission_key)
);

ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read own permissions" ON public.admin_permissions;
CREATE POLICY "Admins can read own permissions"
  ON public.admin_permissions FOR SELECT
  USING (admin_id = auth.uid() AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Super admin can manage admin permissions" ON public.admin_permissions;
CREATE POLICY "Super admin can manage admin permissions"
  ON public.admin_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_admin_permissions_admin
  ON public.admin_permissions(admin_id)
  WHERE deleted_at IS NULL;

-- ══════════════════════════════════════
-- 9. Update admin_audit_logs — add
--    request_id and user_agent
-- ══════════════════════════════════════

ALTER TABLE public.admin_audit_logs
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- ══════════════════════════════════════
-- 10. Rate limiter table (service_role
--     only — no RLS)
-- ══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public._rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ip_address, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
  ON public._rate_limits(ip_address, endpoint);

-- Helper: increment rate limit counter
CREATE OR REPLACE FUNCTION public.increment_rate_limit(p_ip TEXT, p_endpoint TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public._rate_limits
  SET request_count = request_count + 1
  WHERE ip_address = p_ip AND endpoint = p_endpoint;
END;
$$;
