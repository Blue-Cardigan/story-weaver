'use client'

import { useState, useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabaseBrowserClient';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const supabase = createSupabaseBrowserClient();
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false); // Separate loading state for resend
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null); // State for resend feedback
  const [isSigningUp, setIsSigningUp] = useState(false); // To show confirmation message

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setPassword('');
      setError(null);
      setIsSigningUp(false);
      setLoading(false);
      setResendLoading(false); // Reset resend loading
      setResendMessage(null); // Reset resend message
    }
  }, [isOpen]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setIsSigningUp(false);
    setResendMessage(null); // Clear resend message on new signup attempt
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    if (error) {
      console.error('Error signing up:', error.message);
      setError(error.message);
      setLoading(false);
    } else if (data.user && data.user.identities?.length === 0) {
      setError("Please check your email to confirm your account.");
      setIsSigningUp(true);
      setLoading(false);
    } else {
      // User is created but might need email confirmation depending on Supabase settings
      // Or user might be auto-confirmed and logged in.
      // The onAuthStateChange listener in page.tsx should handle closing the modal on successful login.
      setError("Sign up successful! Check email if confirmation is needed.");
      setIsSigningUp(true);
      setLoading(false);
      // Keep modal open to show message, or call onClose() if auto-confirmed?
      // Let's keep it open for the message for now.
      // If auto-login happens, the parent component's listener will close it.
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setIsSigningUp(false);
    setResendMessage(null); // Clear resend message
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('Error signing in:', error.message);
      setError(error.message);
      setLoading(false);
    } else {
      // Login successful, onAuthStateChange listener in parent will handle user state update and modal close
      // setLoading(false); // No need, modal will close
      onClose(); // Close modal immediately on successful trigger
    }
  };

  const handleOAuthSignIn = async (provider: 'google' | 'github') => { // Added Google sign-in
    setError(null);
    setLoading(true);
    setIsSigningUp(false);
    setResendMessage(null); // Clear resend message
    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`, // Or just origin
      },
    });
    if (error) {
      console.error(`Error logging in with ${provider}:`, error.message);
      setError(error.message);
      setLoading(false);
    } else {
        // Redirecting...
        // No need to setLoading(false) or onClose()
    }
  };

  // --- New Function to Handle Resend ---
  const handleResendEmail = async () => {
      if (!email) {
          setResendMessage("Please enter your email address first.");
          return;
      }
      setResendLoading(true);
      setResendMessage(null);
      setError(null); // Clear general errors too

      const { error } = await supabase.auth.resend({
          type: 'signup',
          email: email,
          options: {
              emailRedirectTo: `${window.location.origin}/`, // Keep consistent with signup
          }
      });

      if (error) {
          console.error('Error resending email:', error.message);
          // Use setError for consistency? Or keep separate? Let's use separate for now.
          setResendMessage(`Error: ${error.message}`);
      } else {
          setResendMessage("Confirmation email resent. Please check your inbox (and spam folder).");
      }
      setResendLoading(false);
  };
  // --- End New Function ---

  const buttonClasses = "py-2 px-4 rounded-md text-sm font-medium transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 disabled:opacity-60 disabled:cursor-not-allowed";
  const inputClasses = "block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-slate-500 focus:border-slate-500 sm:text-sm mb-3 disabled:opacity-60";
  const loadingSpinner = (
    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md m-4 relative">
        <button onClick={onClose} className="absolute top-2 right-2 text-gray-500 hover:text-gray-800 text-2xl font-bold">&times;</button>
        <h2 className="text-xl font-semibold text-center mb-4 text-gray-800">Sign In or Sign Up</h2>

        {/* Display Confirmation Message & Resend Option */}
        {isSigningUp && error && (
            <div className="p-3 my-3 text-sm text-center text-green-700 bg-green-100 rounded-md border border-green-200">
                {error}
                {/* Add Resend Button Here */}
                <div className="mt-2">
                    <button
                        type="button"
                        disabled={resendLoading || !email} // Disable if loading or no email entered
                        onClick={handleResendEmail}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                    >
                        {resendLoading ? (
                            <>
                            <svg className="animate-spin -ml-1 mr-1 h-4 w-4 text-blue-600 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Sending...
                            </>
                        ) : "Resend Confirmation Email"}
                    </button>
                </div>
            </div>
        )}

        {/* Display Resend Feedback Message */}
        {resendMessage && (
            <div className={`p-3 my-3 text-sm text-center rounded-md border ${resendMessage.startsWith('Error:') ? 'text-red-700 bg-red-100 border-red-200' : 'text-green-700 bg-green-100 border-green-200'}`}>
                {resendMessage}
            </div>
        )}

        {/* Display General Errors (only if not showing signup confirmation) */}
        {!isSigningUp && error && (
            <div className="p-3 my-3 text-sm text-center text-red-700 bg-red-100 rounded-md border border-red-200">
                {error}
            </div>
        )}

        {/* Hide form if sign up requires confirmation */}
        {!isSigningUp && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
                <label htmlFor="email-modal" className="sr-only">Email</label>
                <input
                    id="email-modal"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClasses}
                    placeholder="Email address"
                    disabled={loading || resendLoading || isSigningUp} // Disable email input when showing confirmation/resending
                />
            </div>
            <div>
                <label htmlFor="password-modal" className="sr-only">Password</label>
                <input
                    id="password-modal"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClasses}
                    placeholder="Password"
                    disabled={loading || resendLoading || isSigningUp} // Disable password when showing confirmation/resending
                />
            </div>
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                <button
                    type="submit"
                    disabled={loading || resendLoading || isSigningUp} // Disable Sign In button
                    className={`${buttonClasses} bg-slate-600 hover:bg-slate-700 text-white w-full sm:w-1/2`}
                >
                  {loading ? loadingSpinner : null} Sign In
                </button>
                <button
                    type="button"
                    disabled={loading || resendLoading || isSigningUp} // Disable Sign Up button
                    onClick={handleSignUp}
                    className={`${buttonClasses} bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-1/2`}
                >
                  {loading ? loadingSpinner : null} Sign Up
                </button>
            </div>
             {/* Divider */}
            <div className="flex items-center my-4">
              <hr className="flex-grow border-t border-gray-300" />
              <span className="mx-2 text-xs text-gray-500">OR</span>
              <hr className="flex-grow border-t border-gray-300" />
            </div>
             {/* Google Sign In Button */}
            <button
                type="button"
                disabled={loading || resendLoading || isSigningUp} // Disable OAuth button
                onClick={() => handleOAuthSignIn('google')}
                className={`${buttonClasses} bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 w-full flex items-center justify-center`}
            >
                {/* Basic Google SVG Icon */} 
                <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    <path d="M1 1h22v22H1z" fill="none"/>
                </svg>
                Sign in with Google
            </button>
          </form>
        )}

      </div>
    </div>
  );
} 