'use client'

import { createSupabaseBrowserClient } from '@/lib/supabaseBrowserClient';
import { User } from '@supabase/supabase-js';
import { useState } from 'react';

interface DashboardOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

export default function DashboardOverlay({ isOpen, onClose, user }: DashboardOverlayProps) {
  const supabase = createSupabaseBrowserClient();
  const [loadingLogout, setLoadingLogout] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogout = async () => {
    setLoadingLogout(true);
    setLogoutError(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error.message);
      setLogoutError(error.message);
      setLoadingLogout(false);
    } else {
      onClose(); // Close overlay on successful logout
      // Auth listener in page.tsx will handle user state change
    }
  };

  if (!isOpen || !user) return null;

  const buttonClasses = "py-2 px-4 rounded-md text-sm font-medium transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 disabled:opacity-60 disabled:cursor-not-allowed";
  const loadingSpinner = (
    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-gradient-to-br from-gray-900/80 via-slate-800/80 to-gray-900/80 backdrop-blur-md animate-fade-in">
      <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-lg m-4 relative border border-slate-300/50">
        {/* Close Button */} 
        <button 
            onClick={onClose} 
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 transition-colors" 
            aria-label="Close dashboard"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-2xl font-semibold text-center mb-6 text-slate-700">Manage Your Story</h2>
        
        <div className="mb-6 p-4 bg-slate-50 rounded border border-slate-200">
            <p className="text-sm text-slate-600">Logged in as:</p>
            <p className="text-md font-medium text-slate-800 truncate">{user.email}</p>
        </div>

        {/* Placeholder for future dashboard content */} 
        <div className="text-center text-slate-500 text-sm mb-8">
            (More dashboard features coming soon...)
        </div>

        {logoutError && (
          <p className="text-red-500 text-sm text-center mb-4">Error logging out: {logoutError}</p>
        )}

        <div className="flex justify-center">
          <button
            onClick={handleLogout}
            disabled={loadingLogout}
            className={`${buttonClasses} ${loadingLogout ? 'bg-red-400' : 'bg-red-600 hover:bg-red-700'} text-white w-full sm:w-auto`}
          >
            {loadingLogout ? loadingSpinner : null} Logout
          </button>
        </div>
      </div>
      {/* Add fade-in animation */}
      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out forwards;
        }
      `}</style>
    </div>
  );
} 