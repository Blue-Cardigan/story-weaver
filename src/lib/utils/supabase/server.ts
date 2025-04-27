import { type CookieOptions, createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/lib/database.types' // Assuming you have generated types

// This function is designed to be used in Server Components, Server Actions,
// and Route Handlers, leveraging the `cookies` function from `next/headers`.
// It provides read and write access to cookies.
export function createSupabaseServerClient() {
  const cookieStore = cookies();

  // Ensure environment variables are available on the server
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Server-side Supabase URL or Anon Key is missing.");
    throw new Error("Missing Supabase environment variables for server client.");
  }

  return createServerClient<Database>( // Use generated DB types if available
    supabaseUrl, 
    supabaseAnonKey, 
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
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

  return createServerClient<Database>( // Use generated DB types if available
    supabaseUrl, 
    supabaseAnonKey, 
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        // No set/remove needed for read-only operations
      },
  });
} 