'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabaseBrowserClient';
import type { Database } from '@/types/supabase';
import { User } from '@supabase/supabase-js';
import EditableText from '@/components/EditableText';
import Chat from '@/components/Chat';
import AuthButton from '@/components/AuthButton';
import AuthModal from '@/components/AuthModal';
import DashboardOverlay from '@/components/DashboardOverlay';
import EditChapterModal from '@/components/EditChapterModal';
import type { ChapterUpdatePayload } from '@/components/EditChapterModal';
import * as Diff from 'diff';
import { v4 as uuidv4 } from 'uuid';

// Define Story type based on DB schema
type Story = Database['public']['Tables']['stories']['Row'];
type StoryGeneration = Database['public']['Tables']['story_generations']['Row'];
type DbChapter = Database['public']['Tables']['chapters']['Row'];

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
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [activeStoryDetails, setActiveStoryDetails] = useState<Story | null>(null);
  const [isLoadingStoryDetails, setIsLoadingStoryDetails] = useState(false);
  const [storyDetailsError, setStoryDetailsError] = useState<string | null>(null);
  const [currentStoryParts, setCurrentStoryParts] = useState<StoryGeneration[]>([]);
  const [isLoadingStoryParts, setIsLoadingStoryParts] = useState(false);
  const [storyPartsError, setStoryPartsError] = useState<string | null>(null);
  const [fetchedChapters, setFetchedChapters] = useState<DbChapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);
  const [chaptersError, setChaptersError] = useState<string | null>(null);
  const [isAddingChapter, setIsAddingChapter] = useState(false);
  const [addChapterError, setAddChapterError] = useState<string | null>(null);
  const [newChapterNumber, setNewChapterNumber] = useState<number | ''>('');
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [newChapterSynopsis, setNewChapterSynopsis] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [styleNote, setStyleNote] = useState('');
  const [globalSynopsis, setGlobalSynopsis] = useState<string | null>(null);
  const [globalStyleNote, setGlobalStyleNote] = useState<string | null>(null);
  const [partInstructions, setPartInstructions] = useState('');
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
  const [isProcessingChange, setIsProcessingChange] = useState(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [diffForEditor, setDiffForEditor] = useState<Diff.Change[] | null>(null);
  const [diffStartIndex, setDiffStartIndex] = useState<number | null>(null);
  const [diffEndIndex, setDiffEndIndex] = useState<number | null>(null);
  const [storyPartsSavingStates, setStoryPartsSavingStates] = useState<Record<string, { isLoading: boolean; error: string | null; success: boolean }>>({});

  // --- State for Editing Chapters ---
  const [isEditChapterModalOpen, setIsEditChapterModalOpen] = useState(false);
  const [editingChapter, setEditingChapter] = useState<DbChapter | null>(null);
  const [isUpdatingChapter, setIsUpdatingChapter] = useState(false);
  const [updateChapterError, setUpdateChapterError] = useState<string | null>(null);
  // --- End Chapter Edit State ---

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
               setActiveStoryId(null);
               setActiveStoryDetails(null);
               setCurrentStoryParts([]);
               setGeneratedStory(null);
               setCurrentGenerationId(null);
               setSynopsis('');
               setStyleNote('');
               setPartInstructions('');
           }
       }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [supabase]);

  const effectiveIdentifier = user?.id ?? anonUserIdentifier;

  const fetchStoryDetails = useCallback(async (storyId: string) => {
    if (!effectiveIdentifier) return;

    setIsLoadingStoryDetails(true);
    setStoryDetailsError(null);
    setActiveStoryDetails(null);

    const headers: HeadersInit = {};
    const url = `/api/stories/${storyId}`;

    if (!user && anonUserIdentifier) {
      headers['X-User-Identifier'] = anonUserIdentifier;
    }

    try {
      const response = await fetch(url, { headers });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch story details');
      }
      setActiveStoryDetails(data as Story);
      setPartInstructions('');
      setSynopsis('');
      setStyleNote('');
    } catch (err) {
      console.error("Failed to fetch story details:", err);
      setStoryDetailsError(err instanceof Error ? err.message : 'Could not load story details.');
    } finally {
      setIsLoadingStoryDetails(false);
    }
  }, [effectiveIdentifier, user, anonUserIdentifier]);

  const fetchStoryParts = useCallback(async (storyId: string) => {
    if (!effectiveIdentifier) return;

    setIsLoadingStoryParts(true);
    setStoryPartsError(null);
    setCurrentStoryParts([]);

    const headers: HeadersInit = {};
    const url = `/api/history?storyId=${encodeURIComponent(storyId)}`;

    if (!user && anonUserIdentifier) {
        headers['X-User-Identifier'] = anonUserIdentifier;
    }

    try {
      const response = await fetch(url, { headers });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch story parts');
      }
      setCurrentStoryParts(data as StoryGeneration[]);
    } catch (err) {
      console.error("Failed to fetch story parts:", err);
      setStoryPartsError(err instanceof Error ? err.message : 'Could not load story parts.');
    } finally {
      setIsLoadingStoryParts(false);
    }
  }, [effectiveIdentifier, user, anonUserIdentifier]);

  const fetchChapters = useCallback(async (storyId: string) => {
    if (!effectiveIdentifier) return;
    setIsLoadingChapters(true);
    setChaptersError(null);
    setFetchedChapters([]);
    setSelectedChapterId(null);
    const headers: HeadersInit = {};
    const url = `/api/stories/${storyId}/chapters`;
    if (!user && anonUserIdentifier) {
        headers['X-User-Identifier'] = anonUserIdentifier;
    }
    try {
        const response = await fetch(url, { headers });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch chapters');
        }
        setFetchedChapters(data as DbChapter[]);
    } catch (err) {
        console.error("Failed to fetch chapters:", err);
        setChaptersError(err instanceof Error ? err.message : 'Could not load chapters.');
    } finally {
        setIsLoadingChapters(false);
    }
  }, [effectiveIdentifier, user, anonUserIdentifier]);

  useEffect(() => {
    if (activeStoryId && effectiveIdentifier) {
      const loadData = async () => {
        setGeneratedStory(null);
        setCurrentGenerationId(null);
        setError(null);
        setAcceptStatus(null);
        setRefinementFeedback('');
        setDiffForEditor(null);
        setDiffStartIndex(null);
        setDiffEndIndex(null);
        setFetchedChapters([]);
        setSelectedChapterId(null);
        setIsLoadingChapters(false);
        setChaptersError(null);

        await fetchStoryDetails(activeStoryId);
        await fetchStoryParts(activeStoryId);
      };
      loadData();
    } else {
      setActiveStoryDetails(null);
      setCurrentStoryParts([]);
      setStoryDetailsError(null);
      setStoryPartsError(null);
      setSynopsis('');
      setStyleNote('');
      setPartInstructions('');
      setLength(500);
      setUseWebSearch(false);
      setFetchedChapters([]);
      setSelectedChapterId(null);
      setIsLoadingChapters(false);
      setChaptersError(null);
    }
  }, [activeStoryId, effectiveIdentifier]);

  useEffect(() => {
    if (activeStoryDetails?.id && activeStoryDetails.structure_type === 'book') {
      fetchChapters(activeStoryDetails.id);
    }
  }, [activeStoryDetails, fetchChapters]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authLoading || !effectiveIdentifier || isLoading) return;

    setIsLoading(true);
    setError(null);
    setGeneratedStory(null);
    setCurrentGenerationId(null);
    setAcceptStatus(null);
    setRefinementFeedback('');

    if (activeStoryId && !activeStoryDetails) {
        setError('Story details are still loading. Please wait.');
        setIsLoading(false);
        return;
    }
    if (!activeStoryId && (!synopsis.trim() || !styleNote.trim())) {
        setError('Please fill in Synopsis and Style Note.');
        setIsLoading(false);
        return;
    }
    const isBookMode = activeStoryDetails?.structure_type === 'book';
    if (activeStoryId && isBookMode && !selectedChapterId && currentStoryParts.filter(p => p.chapter_id).length === 0) {
        setError('Please select or add a chapter before generating the first part.');
        setIsLoading(false);
        return;
    } else if (activeStoryId && isBookMode && !selectedChapterId) {
         setError('Please select a chapter for the next part.');
         setIsLoading(false);
         return;
    }
    if (activeStoryId && !partInstructions.trim() && currentStoryParts.length === 0) {
        setError('Please provide instructions for the next part.');
        setIsLoading(false);
        return;
    }
    if (length === '' || length <= 0) {
        setError('Desired length must be a positive number.');
        setIsLoading(false);
        return;
    }

    const payload: any = {
      length,
      useWebSearch,
    };

    if (activeStoryId && activeStoryDetails) {
        payload.storyId = activeStoryId;
        payload.partInstructions = partInstructions;
        payload.globalSynopsis = activeStoryDetails.global_synopsis;
        payload.globalStyleNote = activeStoryDetails.global_style_note;
        payload.storyTargetLength = activeStoryDetails.target_length;

        let lastPart: StoryGeneration | null = null;
        if (isBookMode && selectedChapterId) {
            lastPart = [...currentStoryParts]
                        .filter(p => p.chapter_id === selectedChapterId)
                        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;
        } else {
            lastPart = currentStoryParts.length > 0 ? currentStoryParts[currentStoryParts.length - 1] : null;
        }

        const currentLength = currentStoryParts.reduce((sum, part) => {
            return sum + (part.generated_story?.split(/\s+/).filter(Boolean).length || 0);
        }, 0);

        payload.currentStoryLength = currentLength;
        payload.previousPartContent = lastPart?.generated_story ?? null;
        if (isBookMode && selectedChapterId) {
             payload.chapterId = selectedChapterId;
        }
    } else {
        payload.synopsis = synopsis;
        payload.styleNote = styleNote;
    }

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
        throw new Error(result.error || `API request failed with status ${response.status}`);
      }

      if (result.story && result.generationId) {
        setGeneratedStory(result.story);
        setCurrentGenerationId(result.generationId);
      } else {
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
    if (!currentGenerationId || !effectiveIdentifier || !generatedStory) return;
    setIsAccepting(true);
    setAcceptStatus(null);
    try {
      const response = await fetch('/api/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            generationId: currentGenerationId,
            editedContent: generatedStory
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to accept generation');
      console.log("Accepted:", result.message);
      setAcceptStatus({ type: 'success', message: result.message || 'Part accepted!' });

      if (activeStoryId) {
          await fetchStoryParts(activeStoryId);
          setGeneratedStory(null);
          setCurrentGenerationId(null);
          setPartInstructions('');
      } else {
          setGeneratedStory(null);
          setCurrentGenerationId(null);
          setSynopsis('');
          setStyleNote('');
      }
    } catch (err) {
      console.error("Accept failed:", err);
      const message = err instanceof Error ? err.message : 'An unknown error occurred while accepting.';
      setAcceptStatus({ type: 'error', message });
    } finally {
       setIsAccepting(false);
    }
  };

  const handleRefine = async () => {
    if (!currentGenerationId || !refinementFeedback.trim() || isRefining || isAccepting || acceptStatus?.type === 'success' || !effectiveIdentifier || !generatedStory) {
        return;
    }

    setIsRefining(true);
    setError(null);
    setAcceptStatus(null);

    try {
         console.log(`Saving potential edits for ${currentGenerationId} before refining...`);
         const saveResponse = await fetch(`/api/generations/${currentGenerationId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ generated_story: generatedStory }),
         });
         if (!saveResponse.ok) {
            const saveResult = await saveResponse.json();
            throw new Error(saveResult.error || `Failed to save edits before refinement (status ${saveResponse.status})`);
         }
         console.log(`Edits for ${currentGenerationId} saved successfully.`);
    } catch (err) {
        console.error("Error saving edits before refinement:", err);
        setError(err instanceof Error ? `Error saving edits: ${err.message}` : 'An unknown error occurred while saving edits before refinement.');
        setIsRefining(false);
        return;
    }

    const payload: any = {
        length: length,
        useWebSearch: useWebSearch,
        parentId: currentGenerationId,
        refinementFeedback: refinementFeedback,
    };

    if (activeStoryId && activeStoryDetails) {
        payload.storyId = activeStoryId;
        payload.partInstructions = partInstructions;
        payload.globalSynopsis = activeStoryDetails.global_synopsis;
        payload.globalStyleNote = activeStoryDetails.global_style_note;
    } else {
        payload.synopsis = synopsis;
        payload.styleNote = styleNote;
    }
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
      if (!response.ok) throw new Error(result.error || `API request failed during refinement`);

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
      await new Promise(resolve => setTimeout(resolve, 1000));
      
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
      setDiffForEditor(null);
      setDiffStartIndex(null);
      setDiffEndIndex(null);
    }
  };

  const handleRejectProposal = () => {
    setDiffForEditor(null);
    setDiffStartIndex(null);
    setDiffEndIndex(null);
  };

  const handleNewChat = () => {
    setDiffForEditor(null);
    setDiffStartIndex(null);
    setDiffEndIndex(null);
  };

  const openAuthModal = () => setIsAuthModalOpen(true);
  const closeAuthModal = () => setIsAuthModalOpen(false);

  const openDashboard = () => setIsDashboardOpen(true);
  const closeDashboard = () => setIsDashboardOpen(false);

  const handleUnloadStory = () => {
      setActiveStoryId(null);
      setGeneratedStory(null);
      setCurrentGenerationId(null);
      setError(null);
      setAcceptStatus(null);
      setRefinementFeedback('');
  };

  const handleStoryPartChange = (partId: string, newContent: string) => {
    setCurrentStoryParts(prevParts =>
      prevParts.map(part =>
        part.id === partId ? { ...part, generated_story: newContent } : part
      )
    );
    setStoryPartsSavingStates(prev => ({
      ...prev,
      [partId]: { isLoading: false, error: null, success: false }
    }));
  };

  const handleSaveChangesForPart = async (partId: string) => {
    const partToSave = currentStoryParts.find(part => part.id === partId);
    if (!partToSave || !partToSave.generated_story) {
        console.error("Cannot save part: Not found or content is empty.");
        setStoryPartsSavingStates(prev => ({ ...prev, [partId]: { isLoading: false, error: "Part data missing.", success: false } }));
        return;
    }

    setStoryPartsSavingStates(prev => ({ ...prev, [partId]: { isLoading: true, error: null, success: false } }));

    try {
        const response = await fetch(`/api/generations/${partId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ generated_story: partToSave.generated_story }),
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || `Failed to save changes (status ${response.status})`);
        }

        setStoryPartsSavingStates(prev => ({ ...prev, [partId]: { isLoading: false, error: null, success: true } }));
        setTimeout(() => {
            setStoryPartsSavingStates(prev => ({ ...prev, [partId]: { isLoading: false, error: null, success: false } }));
        }, 3000);

    } catch (err) {
        console.error(`Failed to save part ${partId}:`, err);
        const message = err instanceof Error ? err.message : "An unknown error occurred.";
        setStoryPartsSavingStates(prev => ({ ...prev, [partId]: { isLoading: false, error: message, success: false } }));
    }
  };

  const handleAddChapterClick = async () => {
    if (!activeStoryId || !newChapterNumber || isAddingChapter) return;

    setIsAddingChapter(true);
    setAddChapterError(null);

    const payload = {
        chapter_number: newChapterNumber,
        title: newChapterTitle.trim() || null,
        synopsis: newChapterSynopsis.trim() || null,
    };

    try {
        const response = await fetch(`/api/stories/${activeStoryId}/chapters`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-User-Identifier': effectiveIdentifier || '' },
            body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok) { throw new Error(result.error || `Failed to add chapter (status ${response.status})`); }

        setNewChapterNumber('');
        setNewChapterTitle('');
        setNewChapterSynopsis('');
        await fetchChapters(activeStoryId);
        setSelectedChapterId(result.id);

    } catch (err) {
        console.error("Failed to add chapter:", err);
        setAddChapterError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
        setIsAddingChapter(false);
    }
  };

  // --- Chapter Edit Modal Handlers ---
  const handleOpenEditChapterModal = (chapter: DbChapter) => {
    setEditingChapter(chapter);
    setUpdateChapterError(null);
    setIsEditChapterModalOpen(true);
  };

  const handleCloseEditChapterModal = () => {
    setIsEditChapterModalOpen(false);
    setUpdateChapterError(null);
    setEditingChapter(null); // Clear editing chapter on close
  };

  const handleUpdateChapterSubmit = async (chapterId: string, formData: ChapterUpdatePayload) => {
    if (!activeStoryId || !effectiveIdentifier) {
        setUpdateChapterError("Cannot update chapter: Story or User identifier is missing.");
        return;
    }
    setIsUpdatingChapter(true);
    setUpdateChapterError(null);

    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    const url = `/api/stories/${activeStoryId}/chapters/${chapterId}`; // Use specific chapter ID endpoint
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
        handleCloseEditChapterModal(); // Close modal on success
        await fetchChapters(activeStoryId); // Refresh the chapter list

        // Update selected chapter details if the currently selected one was edited
        if (selectedChapterId === chapterId) {
            setSelectedChapterId(chapterId); // Re-trigger useEffect or manually update if needed
        }

    } catch (err) {
        console.error(`Page: Failed to update chapter ${chapterId}:`, err);
        setUpdateChapterError(err instanceof Error ? err.message : 'An unknown error occurred during update.');
        // Keep modal open on error
    } finally {
        setIsUpdatingChapter(false);
    }
  };
  // --- End Chapter Edit Modal Handlers ---

  const groupedStoryParts = useMemo(() => {
    if (!activeStoryDetails || currentStoryParts.length === 0) return {};

    const groups: Record<string, StoryGeneration[]> = {};
    const chapterMap = new Map(fetchedChapters.map(ch => [ch.id, ch]));

    currentStoryParts.forEach(part => {
      const chapterId = part.chapter_id || 'uncategorized';
      if (!groups[chapterId]) {
        groups[chapterId] = [];
      }
      groups[chapterId].push(part);
    });

    fetchedChapters.forEach(ch => {
        if (!groups[ch.id]) {
            groups[ch.id] = [];
        }
    });

    const sortedGroupKeys = [
        ...fetchedChapters.map(ch => ch.id),
        ...(groups['uncategorized'] ? ['uncategorized'] : [])
    ];

    return { groups, chapterMap, sortedGroupKeys };

  }, [currentStoryParts, fetchedChapters, activeStoryDetails]);

  return (
    <main className={`flex min-h-screen flex-col justify-start p-12 md:p-24 bg-gradient-to-br from-gray-50 via-stone-50 to-slate-100 text-gray-800 font-sans transition-all duration-300`}>
       <div className={`fixed top-0 left-0 right-0 z-20 flex items-center justify-between p-4 md:p-6 transition-all duration-300 ${!isChatCollapsed ? 'pr-[22rem]' : 'pr-4'} bg-gradient-to-b from-white/80 via-white/50 to-transparent`}>
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

      <div className={`w-full max-w-3xl bg-white/70 backdrop-blur-md rounded-xl shadow-lg p-8 border border-gray-200/50 mb-8 transition-all duration-300 ${!isChatCollapsed ? 'mr-[22rem]' : 'mr-0'} mt-20`}>
        {isLoadingStoryDetails && (
            <p className="text-center text-slate-500 py-4">Loading story details...</p>
         )}
         {storyDetailsError && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                <p className="font-medium">Error loading story:</p> <p>{storyDetailsError}</p>
            </div>
         )}

        {!isLoadingStoryDetails && !storyDetailsError && (
            <form onSubmit={handleSubmit} className="space-y-6">
            {activeStoryDetails ? (
                <>
                    <div className="space-y-4 p-4 bg-slate-50/60 rounded-lg border border-slate-200/70">
                       <h3 className="text-lg font-semibold text-slate-700">Story Context: {activeStoryDetails.title}</h3>
                        {activeStoryDetails.global_synopsis && (
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-0.5">Global Synopsis</label>
                                <p className="text-sm text-gray-800 bg-white/50 p-2 rounded border border-gray-200/50 whitespace-pre-wrap">{activeStoryDetails.global_synopsis}</p>
                            </div>
                        )}
                        {activeStoryDetails.global_style_note && (
                             <div>
                                <label className="block text-xs font-medium text-gray-600 mb-0.5">Global Style Note</label>
                                <p className="text-sm text-gray-800 bg-white/50 p-2 rounded border border-gray-200/50 whitespace-pre-wrap">{activeStoryDetails.global_style_note}</p>
                            </div>
                        )}
                        {activeStoryDetails.global_additional_notes && (
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-0.5">Global Additional Notes</label>
                                <p className="text-sm text-gray-800 bg-white/50 p-2 rounded border border-gray-200/50 whitespace-pre-wrap">{activeStoryDetails.global_additional_notes}</p>
                            </div>
                        )}
                        {!activeStoryDetails.global_synopsis && !activeStoryDetails.global_style_note && !activeStoryDetails.global_additional_notes && (
                            <p className="text-sm text-slate-500 italic">No global notes set for this story.</p>
                        )}
                    </div>

                    {activeStoryDetails.structure_type === 'book' && (
                        <div className="space-y-4 p-4 bg-blue-50/40 rounded-lg border border-blue-200/60">
                            <h3 className="text-lg font-semibold text-blue-800">Chapters</h3>
                            {isLoadingChapters && <p className="text-slate-500 text-sm">Loading chapters...</p>}
                            {chaptersError && <p className="text-red-600 text-sm">Error loading chapters: {chaptersError}</p>}
                            {!isLoadingChapters && !chaptersError && (
                                <div className="space-y-3">
                                    <div>
                                        <label htmlFor="chapterSelect" className="block text-sm font-medium text-gray-700 mb-1">Select Chapter</label>
                                        <select
                                            id="chapterSelect"
                                            value={selectedChapterId || ''}
                                            onChange={(e) => setSelectedChapterId(e.target.value || null)}
                                            className="w-full p-2 border border-gray-300/70 rounded-md shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white/90 disabled:bg-gray-100"
                                            disabled={isAddingChapter || isLoading}
                                        >
                                            <option value="">-- Select a Chapter --</option>
                                            {fetchedChapters.map(ch => (
                                                <option key={ch.id} value={ch.id}>
                                                    Ch. {ch.chapter_number}{ch.title ? `: ${ch.title}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    {/* Add Edit Button for Selected Chapter */}
                                    {selectedChapterId && (
                                        <div className="mt-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const chapterToEdit = fetchedChapters.find(ch => ch.id === selectedChapterId);
                                                    if (chapterToEdit) {
                                                        handleOpenEditChapterModal(chapterToEdit);
                                                    }
                                                }}
                                                disabled={isUpdatingChapter || isLoading}
                                                className="text-xs py-1 px-2 rounded border border-slate-400 hover:bg-slate-100 text-slate-700 transition disabled:opacity-50"
                                            >
                                                Edit Selected Chapter Info
                                            </button>
                                        </div>
                                    )}

                                    <details className="group pt-2">
                                        <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-800 list-none inline-flex items-center">
                                             <span className="group-open:hidden">+ Add New Chapter</span>
                                             <span className="hidden group-open:inline">▼ Add New Chapter</span>
                                        </summary>
                                        <div className="mt-3 space-y-3 p-3 bg-white/60 rounded border border-blue-200/80">
                                             <div>
                                                <label htmlFor="newChapterNumber" className="block text-xs font-medium text-gray-600 mb-0.5">Chapter Number*</label>
                                                <input type="number" id="newChapterNumber" value={newChapterNumber} onChange={e => setNewChapterNumber(e.target.value === '' ? '' : parseInt(e.target.value))} min="1" className="w-full p-1.5 text-sm border border-gray-300/70 rounded-md" placeholder={`Next: ${(fetchedChapters[fetchedChapters.length - 1]?.chapter_number || 0) + 1}`} />
                                             </div>
                                              <div>
                                                <label htmlFor="newChapterTitle" className="block text-xs font-medium text-gray-600 mb-0.5">Title (Optional)</label>
                                                <input type="text" id="newChapterTitle" value={newChapterTitle} onChange={e => setNewChapterTitle(e.target.value)} className="w-full p-1.5 text-sm border border-gray-300/70 rounded-md" />
                                             </div>
                                             <div>
                                                <label htmlFor="newChapterSynopsis" className="block text-xs font-medium text-gray-600 mb-0.5">Synopsis (Optional)</label>
                                                <textarea id="newChapterSynopsis" value={newChapterSynopsis} onChange={e => setNewChapterSynopsis(e.target.value)} rows={2} className="w-full p-1.5 text-sm border border-gray-300/70 rounded-md"></textarea>
                                             </div>
                                             {addChapterError && <p className="text-xs text-red-600">{addChapterError}</p>}
                                             <div className="flex justify-end">
                                                <button type="button" onClick={handleAddChapterClick} disabled={isAddingChapter || !newChapterNumber} className="py-1 px-3 text-xs border rounded bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50">
                                                    {isAddingChapter ? 'Adding...' : 'Add Chapter'}
                                                </button>
                                             </div>
                                        </div>
                                    </details>
                                </div>
                            )}
                        </div>
                    )}

                     <div>
                        <label htmlFor="partInstructions" className="block text-sm font-medium text-gray-700 mb-1">
                            Instructions for Next Part {selectedChapterId && fetchedChapters.find(c => c.id === selectedChapterId) ? `(Chapter ${fetchedChapters.find(c => c.id === selectedChapterId)?.chapter_number})` : ''}
                        </label>
                        <textarea
                          id="partInstructions"
                          name="partInstructions"
                          rows={4}
                          className="w-full p-3 border border-gray-300/70 rounded-lg shadow-sm focus:ring-1 focus:ring-slate-500 focus:border-slate-500 bg-white/80 placeholder-gray-400 transition duration-150 ease-in-out"
                          placeholder="Describe what should happen in this section..."
                          value={partInstructions}
                          onChange={(e) => setPartInstructions(e.target.value)}
                          required
                        />
                      </div>
                </>
            ) : (
                 <>
                    <div>
                        <label htmlFor="synopsis" className="block text-sm font-medium text-gray-700 mb-1">Synopsis</label>
                        <textarea
                          id="synopsis" name="synopsis" rows={4}
                          className="w-full p-3 border border-gray-300/70 rounded-lg shadow-sm focus:ring-1 focus:ring-slate-500 focus:border-slate-500 bg-white/80 placeholder-gray-400 transition duration-150 ease-in-out"
                          placeholder="A lone astronaut discovers an ancient artifact on Mars..."
                          value={synopsis} onChange={(e) => setSynopsis(e.target.value)} required
                        />
                    </div>
                     <div>
                        <label htmlFor="styleNote" className="block text-sm font-medium text-gray-700 mb-1">Style Note</label>
                        <textarea
                          id="styleNote" name="styleNote" rows={3}
                          className="w-full p-3 border border-gray-300/70 rounded-lg shadow-sm focus:ring-1 focus:ring-slate-500 focus:border-slate-500 bg-white/80 placeholder-gray-400 transition duration-150 ease-in-out"
                          placeholder="Evoke a sense of cosmic horror and isolation, minimalist prose..."
                          value={styleNote} onChange={(e) => setStyleNote(e.target.value)} required
                        />
                    </div>
                 </>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label htmlFor="length" className="block text-sm font-medium text-gray-700 mb-1">Desired Length (words)</label>
                    <input
                        type="number" id="length" name="length"
                        className="w-full p-3 border border-gray-300/70 rounded-lg shadow-sm focus:ring-1 focus:ring-slate-500 focus:border-slate-500 bg-white/80 placeholder-gray-400 transition duration-150 ease-in-out [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="e.g., 500" value={length}
                        onChange={(e) => setLength(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                        required min="1"
                    />
                </div>
                <div className="flex items-center justify-start md:justify-end md:pt-7">
                    <div className="flex items-center h-5">
                         <input id="useWebSearch" name="useWebSearch" type="checkbox"
                            checked={useWebSearch} onChange={(e) => setUseWebSearch(e.target.checked)}
                            className="focus:ring-slate-500 h-4 w-4 text-slate-600 border-gray-300/70 rounded transition duration-150 ease-in-out"
                         />
                    </div>
                     <div className="ml-3 text-sm">
                        <label htmlFor="useWebSearch" className="font-medium text-gray-700">Use Web Search</label>
                        <p id="useWebSearch-description" className="text-xs text-gray-500">Allow AI to search the web (if needed).</p>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-200/60">
                 {activeStoryId && (
                     <button
                        type="button"
                        onClick={handleUnloadStory}
                        className="py-2 px-4 border border-slate-400 text-slate-600 rounded-md text-sm font-medium hover:bg-slate-100 transition duration-150 ease-in-out"
                     >
                        ← Unload Story / New Idea
                     </button>
                 )}
                 {!activeStoryId && <div />}

                <button
                  type="submit"
                  disabled={isLoading || isAccepting || isRefining || isLoadingStoryDetails || isLoadingChapters ||
                      (activeStoryDetails?.structure_type === 'book' && !selectedChapterId && currentStoryParts.some(p => p.chapter_id))}
                  className={`inline-flex justify-center py-2 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white transition duration-150 ease-in-out ${
                      (isLoading || isAccepting || isRefining || isLoadingStoryDetails || isLoadingChapters || (activeStoryDetails?.structure_type === 'book' && !selectedChapterId && currentStoryParts.some(p => p.chapter_id)))
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-slate-600 to-gray-800 hover:from-slate-700 hover:to-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500'
                  }`}
                  title={ (activeStoryDetails?.structure_type === 'book' && !selectedChapterId && currentStoryParts.some(p => p.chapter_id)) ? 'Please select a chapter' : ''}
                >
                  {isLoading ? (
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg>
                  ) : null}
                  {isLoading ? 'Weaving...' : (activeStoryId ? 'Generate Next Part' : 'Generate Story Section')}
                </button>
             </div>
            </form>
        )}

        {error && (
          <div className="mt-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            <p className="font-medium">Error:</p> <p>{error}</p>
          </div>
        )}

        {isLoading && (
          <div className="mt-8 p-6 bg-slate-50/50 border border-slate-200/80 rounded-lg shadow-inner space-y-4 animate-pulse">
            <div className="h-6 bg-slate-200 rounded w-3/4 mb-4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-slate-200 rounded"></div>
              <div className="h-4 bg-slate-200 rounded w-5/6"></div>
              <div className="h-4 bg-slate-200 rounded w-4/6"></div>
              <div className="h-4 bg-slate-200 rounded w-5/6"></div>
            </div>
             <div className="h-8 w-full bg-slate-200 rounded my-4"></div>
            <div className="pt-4 border-t border-slate-200 flex justify-end space-x-3">
              <div className="h-8 w-20 bg-slate-200 rounded"></div>
              <div className="h-8 w-20 bg-slate-200 rounded"></div>
            </div>
          </div>
        )}

        {!isLoading && generatedStory && (
          <div className="mt-8 p-6 bg-slate-50/50 border border-slate-200/80 rounded-lg shadow-inner space-y-4">
            <h2 className="text-xl font-semibold text-slate-700">
                {activeStoryId ? 'Generated Next Part' : 'Generated Story'} (ID: {currentGenerationId?.substring(0, 8)}...):
            </h2>
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
                       id="refinementFeedback" name="refinementFeedback" rows={2}
                       className="w-full p-2 border border-gray-300/70 rounded-md shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white/90 placeholder-gray-400 transition duration-150 ease-in-out disabled:opacity-70 disabled:bg-gray-50"
                       placeholder="e.g., Make the tone more optimistic, add more dialogue..."
                       value={refinementFeedback} onChange={(e) => setRefinementFeedback(e.target.value)}
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

        {!isLoading && !generatedStory && !error && (
           <div className="mt-8 p-6 bg-slate-50/50 border border-slate-200/80 rounded-lg shadow-inner text-center">
             <p className="text-slate-500 italic">
               {activeStoryId ? "What will you write next? I'm fizzing with excitement..." : "What will you write today, you creative beauty?"}
             </p>
           </div>
        )}

      </div>

      {activeStoryId && !isLoadingStoryDetails && activeStoryDetails && (
        <div className={`w-full max-w-3xl bg-white/60 backdrop-blur-md rounded-xl shadow-lg p-8 border border-gray-200/40 transition-all duration-300 ${!isChatCollapsed ? 'mr-[22rem]' : 'mr-0'} mb-8`}>
           <h2 className="text-xl font-semibold text-slate-700 mb-4 border-b pb-2">
             Story Content: {activeStoryDetails.title}
           </h2>

           {isLoadingStoryParts && <p className="text-slate-500 text-center py-4">Loading story parts...</p>}
           {storyPartsError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-300 text-red-600 rounded-lg text-sm">
                  <p><span className="font-medium">Error loading parts:</span> {storyPartsError}</p>
              </div>
           )}

           {isLoadingChapters && activeStoryDetails.structure_type === 'book' && <p className="text-slate-500 text-center py-4">Loading chapter index...</p>}

           {!isLoadingStoryParts && !storyPartsError && currentStoryParts.length === 0 && !isLoadingChapters && (
              <p className="text-slate-500 text-center py-4 italic">This story doesn't have any parts yet. Generate the first one above!</p>
           )}

           {!isLoadingStoryParts && !storyPartsError && !isLoadingChapters && currentStoryParts.length > 0 && (
              <div className="space-y-8 max-h-[70vh] overflow-y-auto pr-2 ">
                 {groupedStoryParts.sortedGroupKeys?.map((chapterKey) => {
                      const chapter = groupedStoryParts.chapterMap?.get(chapterKey);
                      const partsInGroup = groupedStoryParts.groups?.[chapterKey] || [];

                      if (partsInGroup.length === 0 && chapterKey !== 'uncategorized') return null;

                      return (
                        <section key={chapterKey} className="space-y-4">
                           {chapter && (
                              <div className="sticky top-0 bg-white/80 backdrop-blur-sm py-1 -mx-4 px-4 z-10 border-b border-blue-200 mb-2">
                                <div className="flex justify-between items-center mb-1">
                                  <h3 className="text-lg font-semibold text-blue-700">
                                      Chapter {chapter.chapter_number}{chapter.title ? `: ${chapter.title}` : ''}
                                  </h3>
                                  <button 
                                      onClick={() => handleOpenEditChapterModal(chapter)}
                                      className="ml-2 text-xs text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100/50 transition-colors">
                                      Edit
                                  </button>
                                </div>
                                {(chapter.style_notes || chapter.additional_notes) && (
                                  <div className="text-xs text-gray-700 space-y-1 pb-1">
                                    {chapter.style_notes && (
                                      <div>
                                        <span className="font-medium text-gray-600">Style:</span>
                                        <p className="pl-2 whitespace-pre-wrap">{chapter.style_notes}</p>
                                      </div>
                                    )}
                                    {chapter.additional_notes && (
                                      <div>
                                        <span className="font-medium text-gray-600">Notes:</span>
                                        <p className="pl-2 whitespace-pre-wrap">{chapter.additional_notes}</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                           )}
                           {chapterKey === 'uncategorized' && partsInGroup.length > 0 && (
                               <h3 className="text-lg font-semibold text-gray-600 border-b border-gray-200 pb-1 sticky top-0 bg-white/80 backdrop-blur-sm py-1 -mx-4 px-4 z-10">
                                   Uncategorized Parts
                               </h3>
                           )}

                           {partsInGroup.map((part, index) => {
                                const partSavingState = storyPartsSavingStates[part.id] || { isLoading: false, error: null, success: false };
                                return (
                                    <div key={part.id} className={`ml-${chapter ? 4 : 0} p-4 rounded-lg border transition-shadow duration-150 ${part.is_accepted ? 'bg-green-50/70 border-green-200 shadow-sm' : 'bg-white/80 border-gray-200/80'}`}>
                                        <div className="flex justify-between items-center mb-2">
                                             <p className="text-sm font-medium text-gray-800">
                                                 {part.is_accepted && <span className="ml-1 text-xs font-semibold text-green-700 py-0.5 px-1.5 rounded bg-green-100 border border-green-200">[Latest Accepted]</span>}
                                             </p>
                                             <p className="text-xs text-gray-500">ID: {part.id?.substring(0, 8)}...</p>
                                         </div>
                                        <EditableText
                                            value={part.generated_story || ''}
                                            onChange={(newContent) => handleStoryPartChange(part.id, newContent)}
                                            placeholder="Edit story content..."
                                            className="bg-white/90 rounded-md border border-gray-300/50 focus-within:ring-1 focus-within:ring-slate-400 focus-within:border-slate-400 mb-2"
                                        />
                                        <div className="mt-2 flex justify-end items-center space-x-3">
                                            {partSavingState.error && (
                                                <span className="text-xs text-red-600">Error: {partSavingState.error}</span>
                                            )}
                                            {partSavingState.success && (
                                                <span className="text-xs text-green-600">Saved!</span>
                                            )}
                                            <button
                                                onClick={() => handleSaveChangesForPart(part.id)}
                                                disabled={partSavingState.isLoading}
                                                className={`py-1 px-3 text-xs border rounded transition duration-150 ease-in-out ${partSavingState.isLoading ? 'bg-gray-200 text-gray-500 cursor-wait' : 'border-slate-400 text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-slate-400 disabled:opacity-50'}`}
                                            >
                                                {partSavingState.isLoading ? 'Saving...' : 'Save Changes'}
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </section>
                      )
                 })}
              </div>
           )}
        </div>
      )}

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
        setActiveStoryId={setActiveStoryId}
        setGlobalSynopsis={setGlobalSynopsis}
        setGlobalStyleNote={setGlobalStyleNote}
      />

      {/* Render the Edit Chapter Modal */}
      <EditChapterModal 
        isOpen={isEditChapterModalOpen}
        onClose={handleCloseEditChapterModal}
        chapter={editingChapter}
        onSubmit={handleUpdateChapterSubmit}
        isUpdating={isUpdatingChapter}
        updateError={updateChapterError}
      />
    </main>
  );
}
