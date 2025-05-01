// src/components/PageHeader.tsx
import React from 'react';
import type { User } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase'; // Assuming Story type is accessible
import AuthButton from '@/components/AuthButton';

// Define Story type based on DB schema - Added type import
type Story = Database['public']['Tables']['stories']['Row'];

interface PageHeaderProps {
  user: User | null;
  authLoading: boolean;
  openDashboard: () => void;
  openAuthModal: () => void;
  activeStoryDetails: Story | null;
  isLoadingStoryDetails: boolean;
  dashboardTriggerRef: React.RefObject<HTMLButtonElement | null>; // Changed type here
}

const PageHeader: React.FC<PageHeaderProps> = ({
  user,
  authLoading,
  openDashboard,
  openAuthModal,
  activeStoryDetails,
  isLoadingStoryDetails,
  dashboardTriggerRef,
}) => {
  return (
    <div className={`fixed top-0 left-0 right-0 z-20 flex items-center justify-between p-4 md:p-6 transition-all duration-300 bg-gradient-to-b from-white/80 via-white/50 to-transparent`}>
      <div className="flex items-center space-x-4">
        <h1 className="text-2xl md:text-3xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-slate-600 to-gray-800 py-1">
          Story Weaver
        </h1>
        {/* Show AuthButton (Sign in/up) or Dashboard Trigger */}
        {!authLoading && (
          user ? (
            <button
              ref={dashboardTriggerRef}
              onClick={openDashboard}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 rounded py-1 px-2 hover:bg-slate-100/50"
              aria-label="Manage your story dashboard"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline -mt-0.5 mr-1 opacity-70" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
              Manage Stories
            </button>
          ) : (
            <AuthButton onSignInClick={openAuthModal} />
          )
        )}
        {activeStoryDetails && !isLoadingStoryDetails && (
            <div className="text-sm font-medium text-slate-600 border-l pl-4 ml-2">
                Editing: <span className="font-semibold">{activeStoryDetails.title}</span>
            </div>
        )}
      </div>
    </div>
  );
};

export default PageHeader;