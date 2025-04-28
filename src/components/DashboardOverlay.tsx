'use client'

import { createSupabaseBrowserClient } from '@/lib/supabaseBrowserClient';
import { Database } from '@/types/supabase';
import { User } from '@supabase/supabase-js';
import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid'; // For anon ID
import CreateStoryModal from './CreateStoryModal'; // Import the modal
import EditStoryModal from './EditStoryModal'; // Import EditStoryModal
import type { StoryUpdatePayload } from './EditStoryModal'; // Import payload type

const ANON_USER_ID_KEY = 'storyWeaverAnonUserId'; // Reuse the key from page.tsx

type Story = Database['public']['Tables']['stories']['Row'];
type StoryStructure = Database['public']['Enums']['story_structure_type'];

interface DashboardOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  setActiveStoryId: (storyId: string | null) => void; // Prop to set active story in parent
  setGlobalSynopsis: (synopsis: string | null) => void; // Prop to set global synopsis in parent
  setGlobalStyleNote: (note: string | null) => void; // Prop to set global style note in parent
}

export default function DashboardOverlay({ 
    isOpen, 
    onClose, 
    user,
    setActiveStoryId, // Destructure the new prop
    setGlobalSynopsis, // Destructure the new prop
    setGlobalStyleNote // Destructure the new prop
}: DashboardOverlayProps) {
  const supabase = createSupabaseBrowserClient();
  const [loadingLogout, setLoadingLogout] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [loadingStories, setLoadingStories] = useState(false);
  const [storyError, setStoryError] = useState<string | null>(null);
  const [anonUserIdentifier, setAnonUserIdentifier] = useState<string | null>(null);

  // State for Create Story Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreatingStory, setIsCreatingStory] = useState(false);
  const [createStoryError, setCreateStoryError] = useState<string | null>(null);

  // --- State for Editing ---
  const [editingStory, setEditingStory] = useState<Story | null>(null); // Story being edited
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isUpdatingStory, setIsUpdatingStory] = useState(false);
  const [updateStoryError, setUpdateStoryError] = useState<string | null>(null);
  // --- End Edit State ---

  // Get anonymous identifier on mount
  useEffect(() => {
    let anonId = localStorage.getItem(ANON_USER_ID_KEY);
    if (!anonId) {
      // In theory, page.tsx should create this, but handle case if dashboard is opened first
      anonId = uuidv4();
      localStorage.setItem(ANON_USER_ID_KEY, anonId);
    }
    setAnonUserIdentifier(anonId);
  }, []);

  const effectiveIdentifier = user?.id ?? anonUserIdentifier;

  // Function to fetch stories
  const fetchStories = useCallback(async () => {
    if (!effectiveIdentifier) {
      console.log("Dashboard: Identifier not ready, skipping story fetch.");
      setLoadingStories(false); // Ensure loading stops if no identifier
      setStories([]); // Clear stories if no identifier
      return;
    }
    setLoadingStories(true);
    setStoryError(null);

    const headers: HeadersInit = {};
    const url = '/api/stories';

    if (!user && anonUserIdentifier) {
      headers['X-User-Identifier'] = anonUserIdentifier;
      // No need for query param as RLS uses header
    }
    // For logged-in users, the server-side Supabase client uses the session cookie.

    try {
      const response = await fetch(url, { 
        headers: headers,
        cache: 'no-store' // Ensure fresh data is fetched
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch stories');
      }
      setStories(data as Story[]);
    } catch (err) {
      console.error("Dashboard: Failed to fetch stories:", err);
      setStoryError(err instanceof Error ? err.message : 'Could not load stories.');
      setStories([]); // Clear stories on error
    } finally {
      setLoadingStories(false);
    }
  }, [effectiveIdentifier, user, anonUserIdentifier]);

  // Fetch stories when the dashboard opens or the effective identifier changes
  useEffect(() => {
    if (isOpen) {
      // Fetch immediately if identifier is ready, otherwise fetch will run when identifier updates
      if (effectiveIdentifier) {
        fetchStories();
      }
    } else {
      // Optionally clear stories when closed to ensure fresh load next time
      // setStories([]); 
      // Close create modal if dashboard is closed
      setIsCreateModalOpen(false);
      setCreateStoryError(null);
      setIsEditModalOpen(false);
      setUpdateStoryError(null);
      setEditingStory(null);
    }
  }, [isOpen, effectiveIdentifier, fetchStories]);

  const handleLogout = async () => {
    setLoadingLogout(true);
    setLogoutError(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error.message);
      setLogoutError(error.message);
    } else {
      setStories([]); // Clear stories on logout
      setStoryError(null);
      setLoadingStories(false);
      setIsCreateModalOpen(false); // Ensure modal is closed on logout
      setCreateStoryError(null);
      setIsEditModalOpen(false);
      setUpdateStoryError(null);
      setEditingStory(null);
      onClose(); // Close overlay on successful logout
    }
    setLoadingLogout(false);
  };

  const handleOpenCreateModal = () => {
    setCreateStoryError(null); // Clear previous errors
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
    setCreateStoryError(null);
  };

  const handleCreateStorySubmit = async (formData: { 
      title: string; 
      structure_type: StoryStructure; 
      global_synopsis?: string; 
      global_style_note?: string;
      target_length?: number;
  }) => {
    if (!effectiveIdentifier) {
        setCreateStoryError("Cannot create story: User identifier is missing.");
        return;
    }
    setIsCreatingStory(true);
    setCreateStoryError(null);

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    const url = '/api/stories';
    if (!user && anonUserIdentifier) {
        headers['X-User-Identifier'] = anonUserIdentifier;
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(formData),
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || `API request failed with status ${response.status}`);
        }

        // Success
        handleCloseCreateModal(); // Close modal on success
        fetchStories(); // Refresh the story list

    } catch (err) {
        console.error('Dashboard: Failed to create story:', err);
        setCreateStoryError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
        setIsCreatingStory(false);
    }
  };

  // --- Edit Modal Handlers ---
  const handleOpenEditModal = (story: Story) => {
    setEditingStory(story);
    setUpdateStoryError(null);
    setIsEditModalOpen(true);
  };
  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setUpdateStoryError(null);
    setEditingStory(null); // Clear editing story on close
  };

  const handleUpdateStorySubmit = async (storyId: string, formData: StoryUpdatePayload) => {
    if (!effectiveIdentifier) {
        setUpdateStoryError("Cannot update story: User identifier is missing.");
        return;
    }
    setIsUpdatingStory(true);
    setUpdateStoryError(null);

    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    const url = `/api/stories/${storyId}`; // Use specific story ID endpoint
    if (!user && anonUserIdentifier) { headers['X-User-Identifier'] = anonUserIdentifier; }

    try {
        const response = await fetch(url, {
            method: 'PATCH', // Use PATCH method
            headers: headers,
            body: JSON.stringify(formData),
        });
        const result = await response.json();
        if (!response.ok) { throw new Error(result.error || `API request failed with status ${response.status}`); }

        // Success
        handleCloseEditModal(); // Close modal on success
        fetchStories(); // Refresh the story list

    } catch (err) {
        console.error(`Dashboard: Failed to update story ${storyId}:`, err);
        setUpdateStoryError(err instanceof Error ? err.message : 'An unknown error occurred during update.');
        // Keep modal open on error
    } finally {
        setIsUpdatingStory(false);
    }
  };

  const handleLoadStory = (story: Story) => {
    setActiveStoryId(story.id); // Set the active story ID in the parent (page.tsx)
    // Load global synopsis and style note into the parent's state
    setGlobalSynopsis(story.global_synopsis ?? null);
    setGlobalStyleNote(story.global_style_note ?? null);
    onClose(); // Close dashboard after loading
  }

  if (!isOpen) return null;

  const buttonClasses = "py-2 px-4 rounded-md text-sm font-medium transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 disabled:opacity-60 disabled:cursor-not-allowed";
  const loadingSpinner = (
    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );

  return (
    <>
      <div className="fixed inset-0 z-60 flex flex-col bg-gradient-to-br from-gray-50 via-stone-50 to-slate-100 text-gray-800 animate-fade-in p-6 sm:p-8 md:p-12">
        {/* Header Area */}
        <div className="flex justify-between items-center mb-6 sm:mb-8">
          <div className="flex items-center space-x-3">
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-700">Story Dashboard</h1>
            {user && (
              <div className="text-xs sm:text-sm bg-slate-200/70 text-slate-600 px-2 py-0.5 rounded">
                  Logged in as: <span className="font-medium">{user.email}</span>
              </div>
            )}
            {!user && anonUserIdentifier && (
              <div className="text-xs sm:text-sm bg-slate-200/70 text-slate-600 px-2 py-0.5 rounded">
                  Anonymous Session
              </div>
            )}
          </div>
          <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-800 transition-colors p-1 rounded-full hover:bg-slate-200/50"
              aria-label="Close dashboard"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-grow overflow-y-auto bg-white/70 backdrop-blur-sm rounded-lg shadow-lg p-6 border border-gray-200/50 space-y-6">
          
          {/* Section: My Stories */}
          <section>
              <h2 className="text-lg font-semibold text-slate-600 mb-4 border-b pb-2">My Stories</h2>
              {loadingStories && <p className="text-slate-500 text-center py-4">Loading stories...</p>}
              {storyError && <p className="text-red-500 text-sm text-center py-4">Error loading stories: {storyError}</p>}
              {!loadingStories && !storyError && stories.length === 0 && (
                  <p className="text-slate-500 text-sm italic text-center py-4">You haven't created any stories yet.</p>
              )}
              {!loadingStories && !storyError && stories.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {stories.map(story => (
                          <div key={story.id} className="bg-white/80 p-4 rounded-lg border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow duration-150 flex flex-col">
                              <div className="flex-grow">
                                  <h3 className="text-md font-semibold text-slate-700 truncate mb-1" title={story.title}>{story.title}</h3>
                                  <p className="text-xs text-slate-500 mb-1">
                                      Type: <span className="capitalize font-medium">{story.structure_type?.replace('_', ' ') || 'N/A'}</span>
                                  </p>
                                  {story.target_length && (
                                     <p className="text-xs text-slate-500 mb-2">
                                         Target Length: <span className="font-medium">~{story.target_length.toLocaleString()} words</span>
                                     </p>
                                  )}
                                  <p className="text-xs text-slate-500 mb-3">
                                      Last updated: {new Date(story.updated_at).toLocaleDateString()}
                                  </p>
                              </div>
                              <div className="flex justify-end space-x-2 mt-auto pt-2">
                                  <button
                                      onClick={() => handleOpenEditModal(story)} // Open edit modal on click
                                      className="text-xs py-1 px-2 rounded border border-slate-300 hover:bg-slate-100 text-slate-600 transition disabled:opacity-50"
                                  >
                                      Edit
                                  </button>
                                  <button
                                    onClick={() => handleLoadStory(story)}
                                    className="text-xs py-1 px-2 rounded border border-blue-500 hover:bg-blue-50 text-blue-600 transition"
                                  >
                                      Load
                                  </button>
                              </div>
                          </div>
                      ))}
                  </div>
              )}
          </section>

          {/* Section: Create New Story */}
          <section>
              <h2 className="text-lg font-semibold text-slate-600 mb-4 border-b pb-2">Create New Story</h2>
              <button 
                onClick={handleOpenCreateModal}
                className={`${buttonClasses} bg-blue-600 hover:bg-blue-700 text-white`}
                disabled={!effectiveIdentifier} // Disable if no user/anonId yet
                title={!effectiveIdentifier ? "Initializing user session..." : "Start a new story"}
              >
                  + Start a New Story
              </button>
          </section>

        </div>

        {/* Footer Area (Logout) */}
        <div className="mt-6 flex justify-end items-center space-x-4">
          {logoutError && (
            <p className="text-red-500 text-sm">Error: {logoutError}</p>
          )}
          <button
            onClick={handleLogout}
            disabled={loadingLogout || (!user && !anonUserIdentifier)} // Disable if no user/anonId
            className={`${buttonClasses} ${loadingLogout ? 'bg-red-400' : 'bg-red-600 hover:bg-red-700'} text-white`}
          >
            {loadingLogout ? loadingSpinner : null} Logout
          </button>
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

      {/* Render the Create Story Modal */}
      <CreateStoryModal 
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        onSubmit={handleCreateStorySubmit}
        isCreating={isCreatingStory}
        createError={createStoryError}
      />
      {/* Render Edit Story Modal */}
      <EditStoryModal
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        story={editingStory} // Pass the story being edited
        onSubmit={handleUpdateStorySubmit}
        isUpdating={isUpdatingStory}
        updateError={updateStoryError}
      />
    </>
  );
} 