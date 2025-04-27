'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabaseBrowserClient';
import type { StoryGeneration } from '@/types/supabase';
import { User } from '@supabase/supabase-js';
import EditableText from '@/components/EditableText';
import Chat from '@/components/Chat';
import AuthButton from '@/components/AuthButton';
import AuthModal from '@/components/AuthModal';
import DashboardOverlay from '@/components/DashboardOverlay';
import * as Diff from 'diff';
import { v4 as uuidv4 } from 'uuid';

interface EditProposal {
  type: 'replace' | 'insert' | 'delete' | 'clarification' | 'none';
  explanation: string;
  startIndex?: number;
  endIndex?: number;
  text?: string;
}

const ANON_USER_ID_KEY = 'storyWeaverAnonUserId';

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [anonUserIdentifier, setAnonUserIdentifier] = useState<string | null>(null);
  const [synopsis, setSynopsis] = useState('');
  const [styleNote, setStyleNote] = useState('');
  const [length, setLength] = useState<number | ''>(500);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [generatedStory, setGeneratedStory] = useState<string | null>(null);
  const [currentGenerationId, setCurrentGenerationId] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptStatus, setAcceptStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [refinementFeedback, setRefinementFeedback] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pastGenerations, setPastGenerations] = useState<StoryGeneration[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isProcessingChange, setIsProcessingChange] = useState(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [diffForEditor, setDiffForEditor] = useState<Diff.Change[] | null>(null);
  const [diffStartIndex, setDiffStartIndex] = useState<number | null>(null);
  const [diffEndIndex, setDiffEndIndex] = useState<number | null>(null);

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const dashboardTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let anonId = localStorage.getItem(ANON_USER_ID_KEY);
    if (!anonId) {
      anonId = uuidv4();
      localStorage.setItem(ANON_USER_ID_KEY, anonId);
    }
    setAnonUserIdentifier(anonId);

    let isMounted = true;
    const fetchInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (isMounted) {
          setUser(session?.user ?? null);
          setAuthLoading(false);
        }
      } catch (error) {
        console.error("Error fetching initial session:", error);
        if (isMounted) setAuthLoading(false);
      }
    };

    fetchInitialSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
       if (isMounted) {
           const currentUser = session?.user ?? null;
           setUser(currentUser);
           setAuthLoading(false);
           if (currentUser && event !== 'SIGNED_OUT') {
               setIsAuthModalOpen(false);
           }
           if (event === 'SIGNED_OUT') {
               setIsDashboardOpen(false);
           }
       }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [supabase]);

  const effectiveIdentifier = user?.id ?? anonUserIdentifier;

  const fetchHistory = async () => {
    if (authLoading || !effectiveIdentifier) {
        console.log("Auth state/identifier not ready, skipping history fetch.");
        return;
    }

    setIsLoadingHistory(true);
    setHistoryError(null);
    
    const headers: HeadersInit = {};
    let url = '/api/history';

    if (user) {
      // Logged-in user: API will use session cookie
      // No extra params/headers needed as RLS uses auth.uid()
    } else if (anonUserIdentifier) {
      // Anonymous user: Pass identifier via query param (and maybe header for RLS)
      url += `?user_identifier=${encodeURIComponent(anonUserIdentifier)}`;
      // Header used by RLS policy for anonymous select
      headers['X-User-Identifier'] = anonUserIdentifier; 
    } else {
      // Should not happen if logic above is correct
      console.warn("Attempted to fetch history without user or anonymous identifier.");
      setIsLoadingHistory(false);
      return;
    }

    try {
      const response = await fetch(url, { headers });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch history data');
      }
      setPastGenerations(data as StoryGeneration[]);
    } catch (err) { 
      console.error("Failed to fetch history:", err);
      setHistoryError(err instanceof Error ? err.message : 'Could not load past generations.');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
     if (!authLoading && effectiveIdentifier) { 
       fetchHistory();
     }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, effectiveIdentifier]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    if (authLoading) {
        setError('Authentication status is loading. Please wait.');
        return;
    }
    if (!effectiveIdentifier) {
        setError('Could not determine user or anonymous identifier. Please refresh.');
        return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedStory(null);
    setCurrentGenerationId(null);
    setAcceptStatus(null);
    setRefinementFeedback('');

    // Basic validation
    if (!synopsis.trim() || !styleNote.trim() || length === '') {
        setError('Please fill in all fields: Synopsis, Style Note, and Desired Length.');
        setIsLoading(false);
        return;
    }
    if (length <= 0) {
        setError('Desired length must be a positive number.');
        setIsLoading(false);
        return;
    }

    const payload: any = {
      synopsis,
      styleNote,
      length,
      useWebSearch,
    };

    if (!user && anonUserIdentifier) {
      payload.userIdentifier = anonUserIdentifier;
    }

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        // Throw error with message from API response or default message
        throw new Error(result.error || `API request failed with status ${response.status}`);
      }

      // Assuming the API returns { story: "...", generationId: "..." } on success
      if (result.story && result.generationId) {
        setGeneratedStory(result.story);
        setCurrentGenerationId(result.generationId);
        // if (result.groundingMetadata) {
        //   setGroundingMetadata(result.groundingMetadata);
        //   // TODO: Render grounding metadata/links if needed
        //   console.log("Grounding Metadata:", result.groundingMetadata);
        // }
      } else {
        // Handle unexpected success response format
        throw new Error('Invalid response format from API.');
      }

    } catch (err) {
      console.error('Generation request failed:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred during generation.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!currentGenerationId) return;
    setIsAccepting(true);
    setAcceptStatus(null);
    try {
      const response = await fetch('/api/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId: currentGenerationId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to accept generation');
      console.log("Accepted:", result.message);
      setAcceptStatus({ type: 'success', message: result.message || 'Generation marked as accepted!' });
      // Optionally clear the form or show a success message
    } catch (err) {
      console.error("Accept failed:", err);
      const message = err instanceof Error ? err.message : 'An unknown error occurred while accepting.';
      setAcceptStatus({ type: 'error', message });
    } finally {
       setIsAccepting(false);
    }
  };

  const handleRefine = async () => {
    if (!currentGenerationId || !refinementFeedback.trim() || isRefining || isAccepting || acceptStatus?.type === 'success' || !effectiveIdentifier) {
        return;
    }

    setIsRefining(true);
    setError(null);
    setAcceptStatus(null);

    const payload: any = {
        styleNote: styleNote, 
        length: length, 
        useWebSearch: useWebSearch, 
        parentId: currentGenerationId, 
        refinementFeedback: refinementFeedback,
    };

    if (!user && anonUserIdentifier) {
      payload.userIdentifier = anonUserIdentifier;
    }

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `API request failed during refinement`);
      }

      if (result.story && result.generationId) {
        setGeneratedStory(result.story);
        setCurrentGenerationId(result.generationId);
        setRefinementFeedback('');
      } else {
        throw new Error('Invalid response format from refinement API.');
      }

    } catch (err) {
        console.error('Refinement request failed:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred during refinement.');
    } finally {
      setIsRefining(false);
    }
  };

  const handleChangeRequest = async (request: string, selections: string[]) => {
    if (!currentGenerationId || !generatedStory) return;
    
    setIsProcessingChange(true);
    setError(null);
    
    try {
      // In a real app, this would be an API call to process the change request
      // For now, we'll simulate a delay and then update the story
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simple implementation: just append the request to the story
      // In a real app, this would be more sophisticated
      const updatedStory = `${generatedStory}\n\n[Change Request: ${request}]\n[Selected Text: ${selections.join(', ')}]`;
      setGeneratedStory(updatedStory);
      
    } catch (err) {
      console.error('Change request failed:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred while processing your change request.');
    } finally {
      setIsProcessingChange(false);
    }
  };

  const handleAcceptProposal = (proposal: EditProposal) => {
    setGeneratedStory(prevStory => {
        if (!prevStory) return "";

        const { type, startIndex, endIndex, text } = proposal;

        // Ensure indices are valid numbers if provided
        const start = typeof startIndex === 'number' ? startIndex : -1;
        const end = typeof endIndex === 'number' ? endIndex : -1;
        const newText = typeof text === 'string' ? text : '';

        try {
             switch (type) {
                case 'replace':
                    if (start >= 0 && end >= 0 && start <= end && end <= prevStory.length) {
                        return prevStory.substring(0, start) + newText + prevStory.substring(end);
                    }
                    console.warn("Invalid indices for replace operation:", proposal);
                    return prevStory;
                case 'insert':
                     if (start >= 0 && start <= prevStory.length) {
                        return prevStory.substring(0, start) + newText + prevStory.substring(start);
                    }
                     console.warn("Invalid startIndex for insert operation:", proposal);
                    return prevStory;
                case 'delete':
                    if (start >= 0 && end >= 0 && start <= end && end <= prevStory.length) {
                        return prevStory.substring(0, start) + prevStory.substring(end);
                    }
                     console.warn("Invalid indices for delete operation:", proposal);
                    return prevStory;
                case 'clarification':
                case 'none':
                default:
                    console.log("No story change applied for type:", type);
                    return prevStory;
            }
        } catch (e) {
            console.error("Error applying edit:", e, proposal);
            return prevStory;
        }

    });
     // Clear the diff display after accepting
    setDiffForEditor(null);
    setDiffStartIndex(null);
    setDiffEndIndex(null);
  };

  const handleReceiveProposal = (proposal: EditProposal) => {
    if (proposal.type === 'replace' && generatedStory && proposal.startIndex !== undefined && proposal.endIndex !== undefined && proposal.text !== undefined) {
      const originalTextSegment = generatedStory.substring(
        proposal.startIndex,
        proposal.endIndex
      );
      const changes = Diff.diffChars(originalTextSegment, proposal.text);
      setDiffForEditor(changes);
      setDiffStartIndex(proposal.startIndex);
      setDiffEndIndex(proposal.endIndex);
    } else {
      // Clear diff for other proposal types (insert, delete, none, clarification)
      setDiffForEditor(null);
      setDiffStartIndex(null);
      setDiffEndIndex(null);
    }
  };

  const handleRejectProposal = (/* messageId: string */) => {
    // Parent primarily needs to clear the diff display
    setDiffForEditor(null);
    setDiffStartIndex(null);
    setDiffEndIndex(null);
  };

  const handleNewChat = () => {
    // Clear any displayed diff when starting a new chat session
    setDiffForEditor(null);
    setDiffStartIndex(null);
    setDiffEndIndex(null);
    // Note: The Chat component itself should handle clearing its internal message state
  };

  const openAuthModal = () => setIsAuthModalOpen(true);
  const closeAuthModal = () => setIsAuthModalOpen(false);

  const openDashboard = () => setIsDashboardOpen(true);
  const closeDashboard = () => setIsDashboardOpen(false);

  return (
    <main className={`flex min-h-screen flex-col justify-start p-12 md:p-24 bg-gradient-to-br from-gray-50 via-stone-50 to-slate-100 text-gray-800 font-sans transition-all duration-300`}>
       {/* Header area adjusted for dashboard trigger */}
       <div className={`fixed top-0 left-0 right-0 z-20 flex items-center justify-between p-4 md:p-6 transition-all duration-300 ${!isChatCollapsed ? 'pr-[22rem]' : 'pr-4'} bg-gradient-to-b from-white/80 via-white/50 to-transparent`}>
         {/* Left side: Title and Manage/Auth button */}
         <div className="flex items-center space-x-4">
            <h1 className="text-2xl md:text-3xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-slate-600 to-gray-800 py-1">
              Story Weaver AI
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
                  {/* Subtle Icon + Text */} 
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline -mt-0.5 mr-1 opacity-70" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                    </svg>
                  Manage your story
                </button>
              ) : (
                <AuthButton onSignInClick={openAuthModal} />
              )
            )}
          </div>
       </div>

      <div className={`w-full max-w-3xl bg-white/70 backdrop-blur-md rounded-xl shadow-lg p-8 border border-gray-200/50 mb-8 transition-all duration-300 ${!isChatCollapsed ? 'mr-[22rem]' : 'mr-0'} mt-20`}>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="synopsis" className="block text-sm font-medium text-gray-700 mb-1">Synopsis</label>
            <textarea
              id="synopsis"
              name="synopsis"
              rows={4}
              className="w-full p-3 border border-gray-300/70 rounded-lg shadow-sm focus:ring-1 focus:ring-slate-500 focus:border-slate-500 bg-white/80 placeholder-gray-400 transition duration-150 ease-in-out"
              placeholder="A lone astronaut discovers an ancient artifact on Mars..."
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="styleNote" className="block text-sm font-medium text-gray-700 mb-1">Style Note</label>
            <textarea
              id="styleNote"
              name="styleNote"
              rows={3}
              className="w-full p-3 border border-gray-300/70 rounded-lg shadow-sm focus:ring-1 focus:ring-slate-500 focus:border-slate-500 bg-white/80 placeholder-gray-400 transition duration-150 ease-in-out"
              placeholder="Evoke a sense of cosmic horror and isolation, minimalist prose..."
              value={styleNote}
              onChange={(e) => setStyleNote(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label htmlFor="length" className="block text-sm font-medium text-gray-700 mb-1">Desired Length (words)</label>
                <input
                type="number"
                id="length"
                name="length"
                className="w-full p-3 border border-gray-300/70 rounded-lg shadow-sm focus:ring-1 focus:ring-slate-500 focus:border-slate-500 bg-white/80 placeholder-gray-400 transition duration-150 ease-in-out [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" // Hide number spinners
                placeholder="e.g., 500"
                value={length}
                onChange={(e) => setLength(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                required
                min="1"
                />
            </div>
            <div className="flex items-center justify-start md:justify-end md:pt-7">
                <div className="flex items-center h-5">
                    <input
                        id="useWebSearch"
                        aria-describedby="useWebSearch-description"
                        name="useWebSearch"
                        type="checkbox"
                        checked={useWebSearch}
                        onChange={(e) => setUseWebSearch(e.target.checked)}
                        className="focus:ring-slate-500 h-4 w-4 text-slate-600 border-gray-300/70 rounded transition duration-150 ease-in-out"
                    />
                </div>
                <div className="ml-3 text-sm">
                    <label htmlFor="useWebSearch" className="font-medium text-gray-700">Use Web Search</label>
                    <p id="useWebSearch-description" className="text-xs text-gray-500">Allow AI to search the web for relevant info (if needed).</p>
                </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isLoading || isAccepting || isRefining}
              className={`inline-flex justify-center py-2 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white transition duration-150 ease-in-out ${(isLoading || isAccepting || isRefining) ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-slate-600 to-gray-800 hover:from-slate-700 hover:to-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500'}`}
            >
              {isLoading ? (
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : null}
              {isLoading ? 'Weaving...' : 'Generate Story Section'}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            <p className="font-medium">Error:</p>
            <p>{error}</p>
          </div>
        )}

        {generatedStory && (
          <div className="mt-8 p-6 bg-slate-50/50 border border-slate-200/80 rounded-lg shadow-inner space-y-4">
            <h2 className="text-xl font-semibold text-slate-700">Generated Story (ID: {currentGenerationId?.substring(0, 8)}...):</h2>
            <EditableText 
              value={generatedStory}
              onChange={setGeneratedStory}
              placeholder="Your story will appear here..."
              className="bg-white/80 rounded-md"
              diffToDisplay={diffForEditor}
              diffStartIndex={diffStartIndex}
              diffEndIndex={diffEndIndex}
            />
            
            {currentGenerationId && acceptStatus?.type !== 'success' && (
                <div>
                   <label htmlFor="refinementFeedback" className="block text-sm font-medium text-gray-700 mb-1">Refinement Instructions:</label>
                   <textarea
                       id="refinementFeedback"
                       name="refinementFeedback"
                       rows={2}
                       className="w-full p-2 border border-gray-300/70 rounded-md shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white/90 placeholder-gray-400 transition duration-150 ease-in-out disabled:opacity-70 disabled:bg-gray-50"
                       placeholder="e.g., Make the tone more optimistic, add more dialogue..."
                       value={refinementFeedback}
                       onChange={(e) => setRefinementFeedback(e.target.value)}
                       disabled={isRefining || isAccepting}
                   />
                </div>
            )}

            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row justify-end items-center space-y-2 sm:space-y-0 sm:space-x-3">
                {acceptStatus && (
                    <span className={`text-sm font-medium ${acceptStatus.type === 'success' ? 'text-green-600' : 'text-red-600'} order-first sm:order-none`}>
                        {acceptStatus.message}
                    </span>
                )}
              
              <div className="flex space-x-3 w-full sm:w-auto justify-end">
                <button 
                  onClick={handleAccept}
                  disabled={!currentGenerationId || isAccepting || acceptStatus?.type === 'success' || isRefining}
                  className={`py-1 px-4 border rounded text-sm font-medium transition duration-150 ease-in-out 
                              ${isAccepting ? 'bg-gray-200 text-gray-500 cursor-wait' : 
                               acceptStatus?.type === 'success' ? 'bg-green-100 text-green-700 border-green-300 cursor-not-allowed' : 
                               'border-green-600 text-green-700 hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed'}
                            `}
                >
                  {isAccepting ? 'Accepting...' : acceptStatus?.type === 'success' ? 'Accepted' : 'Accept'}
                </button>
                
                <button 
                  onClick={handleRefine}
                  disabled={!currentGenerationId || !refinementFeedback.trim() || isRefining || isAccepting || acceptStatus?.type === 'success' || !effectiveIdentifier} 
                  className={`py-1 px-4 border rounded text-sm font-medium transition duration-150 ease-in-out 
                              ${isRefining ? 'bg-gray-200 text-gray-500 cursor-wait' : 
                               'border-blue-600 text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed'}
                            `}
                >
                  {isRefining ? 'Refining...' : 'Refine'} 
                </button>
              </div>
            </div> 
          </div>
        )}

      </div>

      <div className={`w-full max-w-3xl bg-white/60 backdrop-blur-md rounded-xl shadow-lg p-8 border border-gray-200/40 transition-all duration-300 ${!isChatCollapsed ? 'mr-[22rem]' : 'mr-0'} mb-8`}>
        
        {!user && !authLoading && (
           <p className="text-xs text-slate-500 mb-4">
             Sign up so your snippets don't vanish.
           </p>
        )}

        {historyError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-300 text-red-600 rounded-lg text-sm">
                <p><span className="font-medium">Error loading history:</span> {historyError}</p>
            </div>
        )}

        {(authLoading || (isLoadingHistory && !historyError)) && (
            <p className="text-slate-500 text-center py-4">Loading history...</p>
        )}

        {!authLoading && !isLoadingHistory && !historyError && pastGenerations.length === 0 && user && (
            <p className="text-slate-500 text-center py-4">No past generations found for your account.</p>
        )}
        {!authLoading && !isLoadingHistory && !historyError && pastGenerations.length === 0 && !user && anonUserIdentifier && (
            <p className="text-slate-500 text-center py-4">No past generations found for this browser session.</p>
        )}
        {!authLoading && !isLoadingHistory && !historyError && pastGenerations.length === 0 && !user && !anonUserIdentifier && (
            <p className="text-slate-500 text-center py-4">Initializing anonymous session...</p>
        )}

        {!authLoading && !isLoadingHistory && !historyError && pastGenerations.length > 0 && (
            <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                {pastGenerations.map((gen) => (
                    <div key={gen.id} className={`p-4 rounded-lg border ${gen.is_accepted ? 'bg-green-50/70 border-green-200' : 'bg-white/80 border-gray-200/80'}`}> 
                        <p className="text-xs text-gray-500 mb-1">
                          {new Date(gen.created_at!).toLocaleString()} - ID: {gen.id?.substring(0, 8)}...
                          {gen.is_accepted && <span className="ml-2 font-semibold text-green-700">[Accepted]</span>}
                        </p>
                        <p className="text-sm font-medium text-gray-800 mb-1">
                            {gen.parent_generation_id 
                                ? <>Refinement based on parent <span className="font-mono text-xs">{gen.parent_generation_id.substring(0, 8)}...</span></>
                                : <>Initial prompt from synopsis</>
                            }
                        </p>
                        {gen.synopsis && (
                            <p className="text-xs text-gray-600 mb-1"><span className="font-semibold">Synopsis:</span> {gen.synopsis.substring(0, 100)}{gen.synopsis.length > 100 ? '...' : ''}</p>
                        )}
                        {gen.iteration_feedback && (
                             <p className="text-xs text-gray-600 mb-1"><span className="font-semibold">Feedback:</span> {gen.iteration_feedback.substring(0, 100)}{gen.iteration_feedback.length > 100 ? '...' : ''}</p>
                        )}
                        {gen.style_note && (
                            <p className="text-xs text-gray-600 mb-2"><span className="font-semibold">Style:</span> {gen.style_note.substring(0, 100)}{gen.style_note.length > 100 ? '...' : ''}</p>
                        )}
                        {gen.generated_story && (
                            <div className="mt-2">
                                <EditableText 
                                    value={gen.generated_story}
                                    onChange={(newValue) => {
                                        // Update the story in the pastGenerations state
                                        setPastGenerations(prev => 
                                            prev.map(item => 
                                                item.id === gen.id 
                                                    ? {...item, generated_story: newValue} 
                                                    : item
                                            )
                                        );
                                    }}
                                    placeholder="Story content..."
                                    className="bg-white/80 rounded-md"
                                />
                                <div className="mt-2 flex justify-end">
                                    <button
                                        onClick={() => {
                                            setGeneratedStory(gen.generated_story || '');
                                            setCurrentGenerationId(gen.id || null);
                                            setSynopsis(gen.synopsis || '');
                                            setStyleNote(gen.style_note || '');
                                            setLength(gen.requested_length || 500);
                                            setUseWebSearch(gen.use_web_search || false);
                                            setRefinementFeedback('');
                                            setAcceptStatus(null);
                                            // Scroll to the top of the page
                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }}
                                        className="py-1 px-3 text-xs border border-slate-400 text-slate-600 rounded hover:bg-slate-100 transition"
                                    >
                                        Load into Editor
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        )}
      </div>

      <Chat
        className="z-50"
        isCollapsed={isChatCollapsed}
        setIsCollapsed={setIsChatCollapsed}
        currentStory={generatedStory}
        onAcceptProposal={handleAcceptProposal}
        onRejectProposal={handleRejectProposal}
        onReceiveProposal={handleReceiveProposal}
        onNewChat={handleNewChat}
      />

      <AuthModal isOpen={isAuthModalOpen} onClose={closeAuthModal} />

      <DashboardOverlay 
        isOpen={isDashboardOpen} 
        onClose={closeDashboard} 
        user={user}
      />
    </main>
  );
}
