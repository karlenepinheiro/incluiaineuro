import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createKiwifyHandler } from './handler.ts';
Deno.serve(createKiwifyHandler(Deno.env.get('KIWIFY_WEBHOOK_SECRET') ?? '', async args => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await db.rpc('process_verified_kiwify_event', args);
  if (error) throw error;
  return data;
}));
