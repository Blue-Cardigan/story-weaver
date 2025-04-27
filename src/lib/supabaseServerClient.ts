import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'; // Import from new types file

// EXPORT a function to create a server client
// This function should be called from server components/routes.
export function createSupabaseServerClient() {
  const cookieStore = cookies(); // Get the cookie store instance

  // Ensure environment variables are available on the server
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL")
  }
  if (!supabaseAnonKey) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }

  return createServerClient<Database>(
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
            // The `set` method may fail if called from a Server Component
            // context. This can be ignored if middleware handles refresh.
          }
        },
        async remove(name: string, options: CookieOptions) {
          try {
            const cookieStore = await cookies();
            cookieStore.set({ name, value: '', ...options }); // Use set with empty value
          } catch (error) {
            // The `delete` method may fail if called from a Server Component
            // context. This can be ignored if middleware handles refresh.
          }
        },
      },
    }
  );
} 