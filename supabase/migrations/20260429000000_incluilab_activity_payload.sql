-- IncluiLAB: payload estruturado, fallback de HTML e metadados de custo/modo.
-- A aplicação segue usando public.generated_activities para preservar a biblioteca existente.

ALTER TABLE public.generated_activities
  ADD COLUMN IF NOT EXISTS prompt text,
  ADD COLUMN IF NOT EXISTS content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS content_html text,
  ADD COLUMN IF NOT EXISTS style text,
  ADD COLUMN IF NOT EXISTS mode text,
  ADD COLUMN IF NOT EXISTS cost_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.generated_activities
SET cost_credits = COALESCE(cost_credits, credits_used, 0)
WHERE cost_credits IS NULL OR cost_credits = 0;

CREATE INDEX IF NOT EXISTS idx_generated_activities_tenant_updated
  ON public.generated_activities (tenant_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generated_activities_updated_at ON public.generated_activities;
CREATE TRIGGER trg_generated_activities_updated_at
  BEFORE UPDATE ON public.generated_activities
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.my_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.my_tenant_id() TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.generated_activities TO anon, authenticated, service_role;

ALTER TABLE public.generated_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ga_select" ON public.generated_activities;
DROP POLICY IF EXISTS "ga_insert" ON public.generated_activities;
DROP POLICY IF EXISTS "ga_update" ON public.generated_activities;
DROP POLICY IF EXISTS "ga_delete" ON public.generated_activities;

CREATE POLICY "ga_select" ON public.generated_activities
  FOR SELECT USING (tenant_id = public.my_tenant_id());

CREATE POLICY "ga_insert" ON public.generated_activities
  FOR INSERT WITH CHECK (tenant_id = public.my_tenant_id());

CREATE POLICY "ga_update" ON public.generated_activities
  FOR UPDATE USING (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

CREATE POLICY "ga_delete" ON public.generated_activities
  FOR DELETE USING (tenant_id = public.my_tenant_id());
