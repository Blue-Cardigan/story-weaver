import { createBrowserClient } from '@supabase/ssr'
import type { StoryGeneration } from '@/types/supabase'; // Import from new types file

// Ensure environment variables are set
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL")
}
if (!supabaseAnonKey) {
  throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY")
}

// EXPORT a function to create a browser client
export function createSupabaseBrowserClient() {
  // Re-check environment variables inside the function for browser context
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Supabase URL or Anon Key is missing in browser client creation.");
    throw new Error("Missing Supabase environment variables for browser client.");
  }

  return createBrowserClient<StoryGeneration>(
    supabaseUrl,
    supabaseAnonKey
  );
} 