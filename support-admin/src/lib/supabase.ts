import { createClient } from "@supabase/supabase-js";
import { assertSupabaseEnv } from "@/lib/supabase/env";

const { supabaseUrl, supabaseAnonKey } = assertSupabaseEnv();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
});
