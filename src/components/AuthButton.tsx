'use client'

import { useState, useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabaseBrowserClient';
import { User } from '@supabase/supabase-js';

interface AuthButtonProps {
  onSignInClick: () => void; // Callback to open the modal
}

export default function AuthButton({ onSignInClick }: AuthButtonProps) {
  const supabase = createSupabaseBrowserClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true); // Only for initial load now

  useEffect(() => {
    // Fetch initial user session
    const fetchUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setLoading(false);
    };

    fetchUser();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      setLoading(false); // Update loading state on any change
    });

    // Cleanup subscription on unmount
    return () => {
      subscription?.unsubscribe();
    };
  }, [supabase]);

  const buttonClasses = "py-1 px-3 rounded text-sm font-medium transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 disabled:opacity-60";

  // Only show loading or sign-in button
  if (loading) {
    return (
      <button className={`${buttonClasses} bg-gray-400 text-white cursor-not-allowed`} disabled>
        Loading...
      </button>
    );
  }

  // If logged in, render nothing here (handled by page.tsx now)
  if (user) {
    return null;
  }

  // Logged out state: Button to open the modal
  return (
    <button
      onClick={onSignInClick}
      className={`${buttonClasses} bg-slate-600 hover:bg-slate-700 text-white`}
    >
      Sign in / Sign up
    </button>
  );
} 