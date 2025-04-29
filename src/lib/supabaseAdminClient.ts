import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL');
}

if (!supabaseServiceRoleKey) {
  throw new Error('Missing env.SUPABASE_SERVICE_ROLE_KEY');
}

// Note: this client bypasses RLS. Use with caution.
// It's necessary here for the transactional delete-and-insert operation.
export const createSupabaseAdminClient = () => {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      // In service role mode, autoRefreshToken and persistSession
      // are implicitly false and setting them has no effect.
      // We also don't need detectSessionInUrl here, as this client is server-side only.
    },
  });
}; 