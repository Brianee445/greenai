-- Phase 8: Backfill missing profiles, assign plans, record payments, bootstrap super admin

-- 1. Backfill missing profiles for all auth users
INSERT INTO public.profiles (id, email, display_name, role)
SELECT 
  au.id,
  au.email,
  COALESCE(
    au.raw_user_meta_data ->> 'display_name',
    split_part(au.email, '@', 1)
  ),
  'user'
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 2. Record payments for paying users
INSERT INTO public.payments (user_id, amount, currency, reference, status, payment_method, paid_at, gateway_response)
SELECT au.id, 250000, 'NGN', d.ref, 'success', d.method, d.paid_at::timestamptz, '{}'::jsonb
FROM auth.users au
INNER JOIN (VALUES
  ('uchef8466@gmail.com',      'szp6oeacof',  'bank',          '2026-07-21T19:43:00Z'),
  ('angelkutty071@gmail.com',  'jjkdej3tia',  'bank_transfer', '2026-07-21T00:06:00Z'),
  ('angelkutty071@gmail.com',  'kp3ahpljf6',  'bank_transfer', '2026-07-21T00:01:00Z'),
  ('praisegift510@gmail.com',  '55fr3j1jn5',  'bank_transfer', '2026-07-20T19:24:00Z')
) AS d(email, ref, method, paid_at) ON au.email = d.email
WHERE NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.reference = d.ref);

-- 3. Create Pro monthly subscriptions for paying users
INSERT INTO public.subscriptions (user_id, plan_id, billing_cycle, status, start_date, end_date)
SELECT au.id, pl.id, 'monthly', 'active', d.paid_at::timestamptz, (d.paid_at::timestamptz + INTERVAL '31 days')
FROM auth.users au
CROSS JOIN (SELECT id FROM public.plans WHERE slug = 'pro') pl
INNER JOIN (VALUES
  ('uchef8466@gmail.com',      '2026-07-21T19:43:00Z'),
  ('angelkutty071@gmail.com',  '2026-07-21T00:06:00Z'),
  ('praisegift510@gmail.com',  '2026-07-20T19:24:00Z')
) AS d(email, paid_at) ON au.email = d.email
WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = au.id);

-- 4. Assign free plan to all remaining users without a subscription
INSERT INTO public.subscriptions (user_id, plan_id, billing_cycle, status, start_date)
SELECT au.id, fp.id, 'free', 'active', au.created_at
FROM auth.users au
CROSS JOIN (SELECT id FROM public.plans WHERE slug = 'free') fp
LEFT JOIN public.subscriptions s ON s.user_id = au.id
WHERE s.id IS NULL;

-- 5. Bootstrap super admin
SELECT bootstrap_super_admin('c08445333@gmail.com');
