import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Central Supabase client for the whole app.
 * Vite reads env vars via import.meta.env.*
 */
const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

export const DEMO_MODE = !SUPABASE_URL || !SUPABASE_ANON_KEY;

// In DEMO_MODE we return a proxy that throws a clear error if someone tries to use Supabase.
const demoProxy = new Proxy(
  {},
  {
    get() {
      throw new Error(
        'Supabase não está configurado (DEMO_MODE). Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env e reinicie o dev server.'
      );
    },
  }
) as unknown as SupabaseClient;

export const supabase: SupabaseClient = DEMO_MODE
  ? demoProxy
  : createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
