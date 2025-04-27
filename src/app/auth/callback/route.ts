import { createSupabaseServerClient } from '@/lib/utils/supabase/server'
import { NextResponse } from 'next/server'

// Handles the OAuth callback from Supabase (after Google redirect)
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = createSupabaseServerClient(); // Use the server client that can write cookies
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Successful login, redirect to the home page or original destination
      return NextResponse.redirect(`${origin}${next}`)
    }
    console.error('Error exchanging code for session:', error.message);
  }

  // return the user to an error page with instructions
  console.error('OAuth callback received no code or failed to exchange.');
  return NextResponse.redirect(`${origin}/auth/auth-code-error`); // Redirect to an error page
} 