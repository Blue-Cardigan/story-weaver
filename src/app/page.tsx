'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabaseBrowserClient';
import type { Database } from '@/types/supabase';
import { User } from '@supabase/supabase-js';
import AuthModal from '@/components/AuthModal';
import DashboardOverlay from '@/components/DashboardOverlay';
import type { ChapterUpdatePayload } from '@/components/EditChapterModal';
import { v4 as uuidv4 } from 'uuid';
import type { EditProposal, ContextParagraphData } from '@/types/chat';
import PageHeader from '@/components/PageHeader';
import GenerationForm from '@/components/GenerationForm';
import GeneratedStoryDisplay from '@/components/GeneratedStoryDisplay';
import StoryContentDisplay from '@/components/StoryContentDisplay';

// Define Story type based on DB schema
type Story = Database['public']['Tables']['stories']['Row'];
type StoryGeneration = Database['public']['Tables']['story_generations']['Row'];
type DbChapter = Database['public']['Tables']['chapters']['Row'];

const ANON_USER_ID_KEY = 'storyWeaverAnonUserId';
const ANON_CONTINUE_COUNT_KEY = 'storyWeaverAnonContinueCount';
const MAX_ANON_CONTINUES = 3;

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
  const [includeGlobalStyleNote, setIncludeGlobalStyleNote] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [generatedStory, setGeneratedStory] = useState<string | null>(null);
  const [currentGenerationId, setCurrentGenerationId] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptStatus, setAcceptStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proposalForDiff, setProposalForDiff] = useState<EditProposal | null>(null);
  const [diffStartIndex, setDiffStartIndex] = useState<number | null>(null);
  const [diffEndIndex, setDiffEndIndex] = useState<number | null>(null);
  const [storyPartsSavingStates, setStoryPartsSavingStates] = useState<Record<string, { isLoading: boolean; error: string | null; success: boolean }>>({});
  const [selectedContextData, setSelectedContextData] = useState<ContextParagraphData[]>([]);
  const [clearSelectionsTrigger, setClearSelectionsTrigger] = useState(0);

  // --- State for Editing Chapters ---
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
               resetAnonContinueCount();
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
               setFetchedChapters([]);
               setSelectedChapterId(null);
               setIsLoadingChapters(false);
               setChaptersError(null);
               setIsAddingChapter(false);
               setAddChapterError(null);
               setIsUpdatingChapter(false);
               setUpdateChapterError(null);
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
        setFetchedChapters([]);
        setSelectedChapterId(null);
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
        setProposalForDiff(null);
        setDiffStartIndex(null);
        setDiffEndIndex(null);
        setFetchedChapters([]);
        setSelectedChapterId(null);
        setIsLoadingChapters(false);
        setChaptersError(null);
        setAddChapterError(null);
        setUpdateChapterError(null);
        setIsAddingChapter(false);
        setIsUpdatingChapter(false);
        setIncludeGlobalStyleNote(true);

        await fetchStoryDetails(activeStoryId);
        await fetchStoryParts(activeStoryId);
        resetAnonContinueCount();
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
      setAcceptStatus(null);
      setProposalForDiff(null);
      setDiffStartIndex(null);
      setDiffEndIndex(null);
      setAddChapterError(null);
      setUpdateChapterError(null);
      setIsAddingChapter(false);
      setIsUpdatingChapter(false);
      setIncludeGlobalStyleNote(true);
      resetAnonContinueCount();
    }
  }, [activeStoryId, effectiveIdentifier]);

  useEffect(() => {
    if (activeStoryDetails?.id && activeStoryDetails.structure_type === 'book') {
      fetchChapters(activeStoryDetails.id);
    }
  }, [activeStoryDetails, fetchChapters]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authLoading || !effectiveIdentifier || isLoading || isUpdatingChapter) return;

    setIsLoading(true);
    setError(null);
    setGeneratedStory(null);
    setCurrentGenerationId(null);
    setAcceptStatus(null);

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
    if (activeStoryId && isBookMode && !selectedChapterId && currentStoryParts.some(p => p.chapter_id)) {
        setError('Please select a chapter for the next part.');
        setIsLoading(false);
        return;
    }
    if (activeStoryId && !partInstructions.trim() && currentStoryParts.length === 0) {
        setError('Please provide instructions for the first part.');
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
        payload.includeGlobalStyleNote = includeGlobalStyleNote;
        payload.storyTargetLength = activeStoryDetails.target_length;

        let lastPart: StoryGeneration | null = null;
        let relevantParts = currentStoryParts;
        if (isBookMode && selectedChapterId) {
            relevantParts = currentStoryParts.filter(p => p.chapter_id === selectedChapterId);
        } else if (isBookMode && !selectedChapterId) {
            relevantParts = currentStoryParts.filter(p => !p.chapter_id);
        }

        if (relevantParts.length > 0) {
             lastPart = [...relevantParts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
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

      if (result.story) {
        setGeneratedStory(result.story);
        if (result.generationId) {
        setCurrentGenerationId(result.generationId);
          console.log(`Generated and saved story part with ID: ${result.generationId}`);
      } else {
          setCurrentGenerationId(null);
          try {
             localStorage.setItem('latestAnonStoryGeneration', result.story);
             console.log('Generated story part for anonymous user, saved to localStorage.');
          } catch (storageError) {
             console.error("Error saving anonymous story to localStorage:", storageError);
             setError("Could not save the generated story locally. LocalStorage might be full or disabled.");
          }
        }
      } else {
        throw new Error('Invalid response format from API: Missing story content.');
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

  const handleAcceptProposal = (proposal: EditProposal) => {
    if (!generatedStory || !proposal) return;

    const { type, startIndex, endIndex, text = '' } = proposal;

    let updatedStory = generatedStory;

    try {
      switch (type) {
        case 'replace_all':
          if (proposal.text !== undefined) {
            updatedStory = proposal.text;
          } else {
            console.error("Error: 'replace_all' proposal missing text.");
            setError("Failed to apply proposal: Replacement text was missing.");
            return;
          }
          break;
        case 'replace':
          if (startIndex !== undefined && endIndex !== undefined) {
            updatedStory = generatedStory.slice(0, startIndex) + text + generatedStory.slice(endIndex);
          } else {
            throw new Error("Missing indices for replace");
          }
          break;
        case 'insert':
          if (startIndex !== undefined) {
            updatedStory = generatedStory.slice(0, startIndex) + text + generatedStory.slice(startIndex);
          } else {
            throw new Error("Missing startIndex for insert");
          }
          break;
        case 'delete':
          if (startIndex !== undefined && endIndex !== undefined) {
            updatedStory = generatedStory.slice(0, startIndex) + generatedStory.slice(endIndex);
          } else {
            throw new Error("Missing indices for delete");
          }
          break;
        case 'clarification':
        case 'none':
          break;
        default:
          console.warn("Unhandled proposal type in handleAcceptProposal:", type);
          break;
      }

      setGeneratedStory(updatedStory);
      setProposalForDiff(null);
      setDiffStartIndex(null);
      setDiffEndIndex(null);
      setError(null);

    } catch (e: any) {
      console.error("Error applying proposal:", e);
      setError(`Failed to apply proposal: ${e.message || 'Invalid proposal data'}`);
    }
  };

  const handleReceiveProposal = (proposal: EditProposal) => {
    if (!proposal) {
        setProposalForDiff(null);
        setDiffStartIndex(null);
        setDiffEndIndex(null);
        return;
    }

    setProposalForDiff(proposal);

    if (proposal.type === 'replace_all') {
        setDiffStartIndex(0);
        setDiffEndIndex(generatedStory?.length ?? 0);
    } else if (proposal.startIndex !== undefined) {
        setDiffStartIndex(proposal.startIndex);
        setDiffEndIndex(proposal.endIndex ?? proposal.startIndex);
    } else {
        setDiffStartIndex(null);
        setDiffEndIndex(null);
    }
    setError(null);
  };

  const handleRejectProposal = () => {
    setProposalForDiff(null);
    setDiffStartIndex(null);
    setDiffEndIndex(null);
    setError(null);
  };

  const handleNewChat = () => {
    setProposalForDiff(null);
    setDiffStartIndex(null);
    setDiffEndIndex(null);
    setError(null);
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
      setProposalForDiff(null);
      setDiffStartIndex(null);
      setDiffEndIndex(null);
      setIncludeGlobalStyleNote(true);
      resetAnonContinueCount();
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
    if (!activeStoryId || !newChapterNumber || isAddingChapter || isUpdatingChapter) return;

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

  const handleUpdateChapterSubmit = async (chapterId: string, formData: ChapterUpdatePayload) => {
    if (!activeStoryId || !effectiveIdentifier) {
        setUpdateChapterError("Cannot update chapter: Story or User identifier is missing.");
        return;
    }
    setIsUpdatingChapter(true);
    setUpdateChapterError(null);

    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    const url = `/api/stories/${activeStoryId}/chapters/${chapterId}`;
    if (!user && anonUserIdentifier) { headers['X-User-Identifier'] = anonUserIdentifier; }

    try {
        const response = await fetch(url, {
            method: 'PATCH',
            headers: headers,
            body: JSON.stringify(formData),
        });
        const result = await response.json();
        if (!response.ok) { throw new Error(result.error || `API request failed with status ${response.status}`); }

        await fetchChapters(activeStoryId);

        return Promise.resolve();

    } catch (err) {
        console.error(`Page: Failed to update chapter ${chapterId}:`, err);
        const errorMsg = err instanceof Error ? err.message : 'An unknown error occurred during update.';
        setUpdateChapterError(errorMsg);
        throw err;
    } finally {
        setIsUpdatingChapter(false);
    }
  };

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
        ...fetchedChapters.sort((a, b) => a.chapter_number - b.chapter_number).map(ch => ch.id),
        ...(groups['uncategorized'] ? ['uncategorized'] : [])
    ];

    return { groups, chapterMap, sortedGroupKeys };

  }, [currentStoryParts, fetchedChapters, activeStoryDetails]);

  const handleContextSelection = useCallback((data: ContextParagraphData[]) => {
      console.log("Selected context paragraph data:", data);
      setSelectedContextData(data);
  }, []);

  const handleClearContextSelection = useCallback(() => {
    setSelectedContextData([]);
    setClearSelectionsTrigger(prev => prev + 1);
  }, [setSelectedContextData]);

  const resetAnonContinueCount = () => {
    try {
      localStorage.removeItem(ANON_CONTINUE_COUNT_KEY);
      console.log('Anonymous continue count reset.');
    } catch (e) {
      console.error('Failed to reset anon continue count in localStorage:', e);
    }
  };

  const handleContinueNarrative = async () => {
    if (!user) {
      try {
        const currentCount = parseInt(localStorage.getItem(ANON_CONTINUE_COUNT_KEY) || '0', 10);
        if (currentCount >= MAX_ANON_CONTINUES) {
          console.log(`Anon user reached continue limit (${currentCount}/${MAX_ANON_CONTINUES}). Prompting auth.`);
          openAuthModal();
          return;
        }
      } catch (e) {
        console.error('Failed to read anon continue count from localStorage:', e);
      }
    }

    if (authLoading || !effectiveIdentifier || isLoading || !generatedStory || length === '' || length <= 0 || isUpdatingChapter) {
       console.warn("Continue narrative aborted.", { authLoading, effectiveIdentifier: !!effectiveIdentifier, isLoading, generatedStory: !!generatedStory, length, isUpdatingChapter });
       setError("Cannot continue narrative. Ensure valid state.");
       return;
     }
     if (activeStoryId && !activeStoryDetails) {
       setError("Cannot continue narrative: Story details are not loaded yet.");
       return;
     }
     if (!activeStoryId && (!synopsis.trim() || !styleNote.trim())) {
       setError("Cannot continue narrative without original context.");
       return;
     }
    setIsLoading(true);
    setError(null);
    setCurrentGenerationId(null);
    setAcceptStatus(null);
    const isBookMode = activeStoryDetails?.structure_type === 'book';
    const payload: any = {
      length,
      useWebSearch: false,
      partInstructions: "Continue the narrative naturally...",
      previousPartContent: generatedStory,
    };
    if (activeStoryId && activeStoryDetails) {
        payload.storyId = activeStoryId;
        payload.globalSynopsis = activeStoryDetails.global_synopsis;
        payload.globalStyleNote = activeStoryDetails.global_style_note;
        payload.includeGlobalStyleNote = includeGlobalStyleNote;
        payload.storyTargetLength = activeStoryDetails.target_length;
        const currentLength = currentStoryParts.reduce((sum, part) => {
            return sum + (part.generated_story?.split(/\s+/).filter(Boolean).length || 0);
        }, 0) + (generatedStory.split(/\s+/).filter(Boolean).length || 0);
        payload.currentStoryLength = currentLength;
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `API request failed`);

      if (result.story) {
        setGeneratedStory(result.story);
        if (result.generationId) {
             setCurrentGenerationId(result.generationId);
             console.log(`Continued narrative. New part ID: ${result.generationId}`);
         } else {
              setCurrentGenerationId(null);
              try {
                  localStorage.setItem('latestAnonStoryGeneration', result.story);
                  console.log('Continued anonymous story, saved locally.');
              } catch (storageError) {
                  console.error("Error saving continued anon story:", storageError);
                  setError("Could not save continued story locally.");
              }
         }

        if (!user) {
          try {
            const currentCount = parseInt(localStorage.getItem(ANON_CONTINUE_COUNT_KEY) || '0', 10);
            const newCount = currentCount + 1;
            localStorage.setItem(ANON_CONTINUE_COUNT_KEY, newCount.toString());
            console.log(`Anon continue count incremented to ${newCount}`);
          } catch (e) {
            console.error('Failed to increment anon continue count:', e);
          }
        }

        setProposalForDiff(null);
        setDiffStartIndex(null);
        setDiffEndIndex(null);
      } else {
        throw new Error('Invalid response format.');
      }

    } catch (err) {
      console.error('Continue narrative failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error during continuation.');
    } finally {
      setIsLoading(false);
    }
  };

  const isAuthenticated = user !== null;

  return (
    <main className={`flex min-h-screen flex-col justify-start p-4 sm:p-8 md:p-12 lg:p-24 bg-gradient-to-br from-gray-50 via-stone-50 to-slate-100 text-gray-800 font-sans transition-all duration-300`}>
       <PageHeader
          user={user}
          authLoading={authLoading}
          openDashboard={openDashboard}
          openAuthModal={openAuthModal}
          activeStoryDetails={activeStoryDetails}
          isLoadingStoryDetails={isLoadingStoryDetails}
          dashboardTriggerRef={dashboardTriggerRef}
       />

      <div className={`w-full max-w-3xl bg-white/70 backdrop-blur-md rounded-xl shadow-lg p-4 sm:p-6 md:p-8 border border-gray-200/50 mb-8 transition-all duration-300 mt-16 sm:mt-20`}>
        {isLoadingStoryDetails && (
            <p className="text-center text-slate-500 py-4">Loading story details...</p>
         )}
         {storyDetailsError && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                <p className="font-medium">Error loading story:</p> <p>{storyDetailsError}</p>
            </div>
         )}

        {!isLoadingStoryDetails && !storyDetailsError && (
            <GenerationForm
                handleSubmit={handleSubmit}
                activeStoryDetails={activeStoryDetails}
                synopsis={synopsis}
                setSynopsis={setSynopsis}
                styleNote={styleNote}
                setStyleNote={setStyleNote}
                partInstructions={partInstructions}
                setPartInstructions={setPartInstructions}
                length={length}
                setLength={setLength}
                useWebSearch={useWebSearch}
                setUseWebSearch={setUseWebSearch}
                includeGlobalStyleNote={includeGlobalStyleNote}
                setIncludeGlobalStyleNote={setIncludeGlobalStyleNote}
                isLoading={isLoading}
                isAccepting={isAccepting}
                isLoadingStoryDetails={isLoadingStoryDetails}
                isLoadingChapters={isLoadingChapters}
                handleUnloadStory={handleUnloadStory}
                activeStoryId={activeStoryId}
                fetchedChapters={fetchedChapters}
                chaptersError={chaptersError}
                selectedChapterId={selectedChapterId}
                setSelectedChapterId={setSelectedChapterId}
                isAddingChapter={isAddingChapter}
                newChapterNumber={newChapterNumber}
                setNewChapterNumber={setNewChapterNumber}
                newChapterTitle={newChapterTitle}
                setNewChapterTitle={setNewChapterTitle}
                newChapterSynopsis={newChapterSynopsis}
                setNewChapterSynopsis={setNewChapterSynopsis}
                addChapterError={addChapterError}
                handleAddChapterClick={handleAddChapterClick}
                handleUpdateChapter={handleUpdateChapterSubmit}
                isUpdatingChapter={isUpdatingChapter}
                updateChapterError={updateChapterError}
                currentStoryParts={currentStoryParts}
            />
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

        {!isLoading && (
          <GeneratedStoryDisplay
              generatedStory={generatedStory}
              setGeneratedStory={setGeneratedStory}
              activeStoryId={activeStoryId}
              proposalForDiff={proposalForDiff}
              diffStartIndex={diffStartIndex}
              diffEndIndex={diffEndIndex}
              handleContextSelection={handleContextSelection}
              currentGenerationId={currentGenerationId}
              handleAcceptProposal={handleAcceptProposal}
              handleRejectProposal={handleRejectProposal}
              handleReceiveProposal={handleReceiveProposal}
              handleNewChat={handleNewChat}
              selectedChapterId={selectedChapterId}
              effectiveIdentifier={effectiveIdentifier}
              selectedContextData={selectedContextData}
              handleClearContextSelection={handleClearContextSelection}
              clearSelectionsTrigger={clearSelectionsTrigger}
              acceptStatus={acceptStatus}
              handleAccept={handleAccept}
              isAccepting={isAccepting}
              handleContinueNarrative={handleContinueNarrative}
              isLoading={isLoading}
              isAuthenticated={isAuthenticated}
          />
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
         <StoryContentDisplay
            activeStoryDetails={activeStoryDetails}
            isLoadingStoryParts={isLoadingStoryParts}
            storyPartsError={storyPartsError}
            isLoadingChapters={isLoadingChapters}
            currentStoryParts={currentStoryParts}
            groupedStoryParts={groupedStoryParts}
            storyPartsSavingStates={storyPartsSavingStates}
            handleStoryPartChange={handleStoryPartChange}
            handleSaveChangesForPart={handleSaveChangesForPart}
         />
      )}

      <AuthModal isOpen={isAuthModalOpen} onClose={closeAuthModal} />

      <DashboardOverlay 
        isOpen={isDashboardOpen} 
        onClose={closeDashboard} 
        user={user}
        setActiveStoryId={setActiveStoryId}
        setGlobalSynopsis={setGlobalSynopsis}
        setGlobalStyleNote={setGlobalStyleNote}
      />
    </main>
  );
}
