-- Minimal, disposable PostgreSQL fixture. NEVER run against an application DB.
-- Business functions are loaded from repository migrations by the test runner.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')
$$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY, name text, is_internal boolean DEFAULT false,
  is_active boolean DEFAULT true
);
CREATE TABLE public.users (
  id uuid PRIMARY KEY, tenant_id uuid REFERENCES public.tenants(id),
  email text, is_super_admin boolean DEFAULT false,
  ai_credits integer DEFAULT 0, created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE FUNCTION public.is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_super_admin = true)
$$;
CREATE FUNCTION public.my_tenant_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid()
$$;
CREATE TABLE public.credits_wallet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid UNIQUE REFERENCES public.tenants(id),
  balance integer NOT NULL DEFAULT 0, last_reset_at timestamptz,
  last_credit_grant_at timestamptz, next_credit_grant_at timestamptz,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.credits_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES public.tenants(id),
  user_id uuid REFERENCES public.users(id), type text, amount integer,
  description text, operation text, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.plans (id uuid PRIMARY KEY, name text);
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY, tenant_id uuid REFERENCES public.tenants(id),
  plan_id uuid REFERENCES public.plans(id), billing_cycle text,
  current_period_end timestamptz, status text
);
CREATE TABLE public.admin_audit_logs (
  action text, resource_type text, resource_id text, tenant_id uuid,
  performed_by uuid, performed_by_email text, before_data jsonb, after_data jsonb, reason text
);
