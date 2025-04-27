import { type CookieOptions, createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { type StoryGeneration } from '@/types/supabase'

// This function is designed to be used in Server Components, Server Actions,
// and Route Handlers, leveraging the `cookies` function from `next/headers`.
// It provides read and write access to cookies.
export function createSupabaseServerClient() {

  // Ensure environment variables are available on the server
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Server-side Supabase URL or Anon Key is missing.");
    throw new Error("Missing Supabase environment variables for server client.");
  }

  return createServerClient<StoryGeneration>( // Use just the StoryGeneration type
    supabaseUrl, 
    supabaseAnonKey, 
    {
      cookies: {
        async get(name: string) {
          const cookieStore = await cookies();
          return cookieStore.get(name)?.value;
        },
        async set(name: string, value: string, options: CookieOptions) {
          try {
            const cookieStore = await cookies();
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
        async remove(name: string, options: CookieOptions) {
          try {
            const cookieStore = await cookies();
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // The `remove` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
  });
}

// This function can be used when you only need to read data and don't need 
// to write cookies (potentially slightly more performant by omitting set/remove).
// Useful in Server Components that only fetch data.
export function createSupabaseServerClientReadOnly() {
  const cookieStore = cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Server-side Supabase URL or Anon Key is missing.");
    throw new Error("Missing Supabase environment variables for server client.");
  }

  return createServerClient<StoryGeneration>( // Use just the StoryGeneration type
    supabaseUrl, 
    supabaseAnonKey, 
    {
      cookies: {
        async get(name: string) {
          const cookieStore = await cookies();
          return cookieStore.get(name)?.value;
        },
        // No set/remove needed for read-only operations
      },
  });
} 