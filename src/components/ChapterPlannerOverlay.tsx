'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { Database } from '@/types/supabase';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

type DbChapter = Database['public']['Tables']['chapters']['Row']; // Type for fetched chapters

type ChapterOutline = {
  // Allow potentially null/undefined during creation/editing
  title?: string | null;
  synopsis?: string | null;
  style_notes?: string | null;
  additional_notes?: string | null;
  // No chapter_number needed here, determined by array index

  // Add id and chapter_number from DB for fetched chapters
  id?: string;
  chapter_number?: number;
};

// Define a type for the form data during editing to ensure title/synopsis are present if needed
type ChapterEditFormData = {
    title: string;
    synopsis: string;
    style_notes: string;
    additional_notes: string;
};

// Type for the global story details that can be edited locally
type EditableStoryDetails = {
    global_synopsis: string;
    global_style_note: string;
    global_additional_notes: string;
};

interface ChapterPlannerOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  storyId: string;
  storyTitle: string;
  globalSynopsis?: string | null;
  globalStyleNote?: string | null;
  globalAdditionalNotes?: string | null;
  targetLength?: number | null;
}

export default function ChapterPlannerOverlay({
  isOpen,
  onClose,
  storyId,
  storyTitle,
  globalSynopsis,
  globalStyleNote,
  globalAdditionalNotes,
  targetLength,
}: ChapterPlannerOverlayProps) {
  const [numChaptersToGenerate, setNumChaptersToGenerate] = useState<number | ''>(10); // Default to 10? 
  const [planningNotes, setPlanningNotes] = useState('');
  const [chapters, setChapters] = useState<ChapterOutline[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null); // Separate error for generator
  const [loadingExistingChapters, setLoadingExistingChapters] = useState(false); // State for fetching

  // --- State for Global Story Details ---
  const [storyDetails, setStoryDetails] = useState<EditableStoryDetails>({
      global_synopsis: globalSynopsis || '',
      global_style_note: globalStyleNote || '',
      global_additional_notes: globalAdditionalNotes || '',
  });
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [saveDetailsError, setSaveDetailsError] = useState<string | null>(null);
  const [saveDetailsSuccess, setSaveDetailsSuccess] = useState<string | null>(null);
  // Keep track of original values to compare for changes
  const [originalStoryDetails, setOriginalStoryDetails] = useState<EditableStoryDetails | null>(null);
  // -------------------------------------

  // --- State for Editing --- 
  const [editingChapterIndex, setEditingChapterIndex] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<ChapterEditFormData | null>(null);
  // -----------------------

  // --- Save Plan Handler ---
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // --- Fetch Existing Chapters --- 
  const fetchChapters = useCallback(async () => {
      if (!storyId) return;
      setLoadingExistingChapters(true);
      setError(null);
      setChapters([]); // Clear local chapters before fetching
      console.log(`ChapterPlanner: Fetching chapters for story ${storyId}...`);

      try {
          const response = await fetch(`/api/stories/${storyId}/chapters`);
          if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
          }
          const existingChapters: DbChapter[] = await response.json();

          // Map DbChapter to ChapterOutline
          const formattedChapters: ChapterOutline[] = existingChapters.map(ch => ({
              id: ch.id,
              chapter_number: ch.chapter_number,
              title: ch.title,
              synopsis: ch.synopsis,
              style_notes: ch.style_notes,
              additional_notes: ch.additional_notes,
          }));

          setChapters(formattedChapters);
          console.log(`ChapterPlanner: Fetched ${formattedChapters.length} chapters.`);
      } catch (err: any) {
          console.error('Error fetching existing chapters:', err);
          setError(err.message || 'Failed to load existing chapter plan.');
          setChapters([]); // Ensure chapters are empty on error
      } finally {
          setLoadingExistingChapters(false);
      }
  }, [storyId]);
  // --------------------------

  // Fetch chapters when the overlay opens or storyId changes
  useEffect(() => {
      if (isOpen && storyId) {
          fetchChapters();
      }
      // Clear chapters if overlay is closed or storyId becomes invalid (e.g., during transitions)
      if (!isOpen || !storyId) {
          setChapters([]);
      }
      // Only re-run if isOpen or storyId changes
  }, [isOpen, storyId, fetchChapters]);

  // Effect to manage component state based on isOpen and initial props
  useEffect(() => {
    if (isOpen) {
      // Set initial state only once when opening (when originalStoryDetails is null)
      // This ensures subsequent prop changes while open don't reset the baseline
      if (originalStoryDetails === null) {
        console.log("Setting initial story details baseline because original is null.");
        const initialDetails = {
          global_synopsis: globalSynopsis || '',
          global_style_note: globalStyleNote || '',
          global_additional_notes: globalAdditionalNotes || '',
        };
        setStoryDetails(initialDetails);
        setOriginalStoryDetails(initialDetails);
        // Reset messages specific to this section
        setSaveDetailsError(null);
        setSaveDetailsSuccess(null);
      }
    } else {
      // Reset ALL relevant state when the component is closed
      console.log("Resetting overlay state on close.");
      // Chapter related state
      setChapters([]);
      setNumChaptersToGenerate(10);
      setPlanningNotes('');
      setError(null);
      setGenerationError(null);
      setIsLoading(false); // Reset plan generation/modification loading
      setLoadingExistingChapters(false); // Reset chapter fetching loading

      // Editing state
      setEditingChapterIndex(null);
      setEditFormData(null);

      // Global details state
      setStoryDetails({ global_synopsis: '', global_style_note: '', global_additional_notes: '' }); // Clear fields
      setOriginalStoryDetails(null); // IMPORTANT: Reset baseline
      setIsSavingDetails(false); // Reset details save loading
      setSaveDetailsError(null);
      setSaveDetailsSuccess(null);

      // Plan saving state
      setIsSaving(false); // Reset plan save loading
      setSaveError(null);
      setSaveSuccess(null);
    }
    // Dependencies: Run when open/close state changes, or when the initial props used for baseline change.
    // Do NOT include originalStoryDetails in dependencies.
  }, [isOpen, storyId, globalSynopsis, globalStyleNote, globalAdditionalNotes]);

  const handlePlanUpdate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLoading) return; // Only check loading state

    const hasExistingChapters = chapters.length > 0;

    // Validation specific to generation
    if (!hasExistingChapters && (!numChaptersToGenerate || numChaptersToGenerate <= 0)) {
        setGenerationError("Please enter a valid number of chapters to generate.");
        return;
    }
    // Validation specific to modification (e.g., require instructions?)
    // Maybe add later if needed:
    // if (hasExistingChapters && !planningNotes.trim()) {
    //     setGenerationError("Please provide modification instructions.");
    //     return;
    // }

    setIsLoading(true);
    setError(null);
    // Don't clear chapters immediately if modifying
    // setChapters([]);
    setGenerationError(null);
    setEditingChapterIndex(null);

    const requestBody: any = {
        storyId,
        globalSynopsis: storyDetails.global_synopsis || undefined, // Use current state
        globalStyleNote: storyDetails.global_style_note || undefined,
        globalAdditionalNotes: storyDetails.global_additional_notes || undefined,
    };

    const apiEndpoint = '/api/generate-chapters'; // Assuming we adapt this endpoint

    if (hasExistingChapters) {
        // Modification request
        console.log("Sending modification request...");
        requestBody.existingChapters = chapters; // Send current chapters
        requestBody.modificationInstructions = planningNotes.trim() || undefined;
        requestBody.numChapters = numChaptersToGenerate || undefined; // Still send target number as a hint? Or make optional in backend?
        // Potentially use a different endpoint or query param later if needed
        // apiEndpoint = '/api/modify-chapters';
    } else {
        // Generation request
        console.log("Sending generation request...");
        requestBody.numChapters = Number(numChaptersToGenerate);
        requestBody.targetBookLength = targetLength;
        requestBody.generationNotes = planningNotes.trim() || undefined; // Use planningNotes as generationNotes here
    }


    try {
        const response = await fetch(apiEndpoint, { // Use the determined endpoint
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody), // Send the constructed body
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (Array.isArray(data.chapters)) {
            // Ensure basic structure even if API returns sparse data
            const validatedChapters: ChapterOutline[] = data.chapters.map((ch: any, index: number) => ({
                id: ch.id, // Keep existing ID if backend returns it
                chapter_number: ch.chapter_number || index + 1, // Ensure chapter_number is present
                title: ch?.title ?? `Chapter ${index + 1}`,
                synopsis: ch?.synopsis ?? '',
                style_notes: ch?.style_notes ?? '',
                additional_notes: ch?.additional_notes ?? '',
            }));
            setChapters(validatedChapters); // Update with the new/modified chapters
            setPlanningNotes(''); // Clear planning notes after successful update
        } else {
            console.error("Received non-array data for chapters:", data.chapters);
            throw new Error("Invalid chapter data received from server.");
        }

    } catch (err: any) {
        console.error(`Error ${hasExistingChapters ? 'modifying' : 'generating'} chapters:`, err);
        setError(err.message || `Failed to ${hasExistingChapters ? 'modify' : 'generate'} chapters.`);
        setGenerationError(err.message || `Failed to ${hasExistingChapters ? 'modify' : 'generate'} chapters.`); // Set specific error
    } finally {
        setIsLoading(false);
    }
  };

  // --- Edit Handlers ---
  const handleEditClick = (index: number) => {
      setEditingChapterIndex(index);
      const chapterToEdit = chapters[index];
      setEditFormData({
          title: chapterToEdit.title || '', // Ensure defined for form
          synopsis: chapterToEdit.synopsis || '',
          style_notes: chapterToEdit.style_notes || '',
          additional_notes: chapterToEdit.additional_notes || '',
      });
  };

  const handleCancelEdit = () => {
      setEditingChapterIndex(null);
      setEditFormData(null);
  };

  const handleSaveEdit = () => {
      if (editingChapterIndex === null || !editFormData) return;

      const updatedChapters = [...chapters];
      updatedChapters[editingChapterIndex] = {
          title: editFormData.title.trim(),
          synopsis: editFormData.synopsis.trim(),
          style_notes: editFormData.style_notes.trim() || undefined,
          additional_notes: editFormData.additional_notes.trim() || undefined,
      };
      setChapters(updatedChapters);
      handleCancelEdit(); // Exit edit mode
  };

  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!editFormData) return;
      const { name, value } = e.target;
      setEditFormData(prev => prev ? { ...prev, [name]: value } : null);
  };
  // ---------------------

  // --- Add/Delete/Insert Handlers ---
  const handleAddChapter = (index?: number) => {
      const newChapter: ChapterOutline = {
          title: 'New Chapter',
          synopsis: '',
          style_notes: '',
          additional_notes: '',
      };

      let insertIndex: number;
      let updatedChapters: ChapterOutline[];

      if (index !== undefined && index >= 0 && index <= chapters.length) {
          // Insert at the specified index
          updatedChapters = [...chapters];
          updatedChapters.splice(index, 0, newChapter);
          insertIndex = index;
      } else {
          // Append to the end if index is invalid or not provided
          updatedChapters = [...chapters, newChapter];
          insertIndex = updatedChapters.length - 1;
      }

      // Prepare the form data for the new chapter *before* setting state
      const newChapterFormData: ChapterEditFormData = {
          title: newChapter.title || '', // Use data from the newChapter object
          synopsis: newChapter.synopsis || '',
          style_notes: newChapter.style_notes || '',
          additional_notes: newChapter.additional_notes || '',
      };

      setChapters(updatedChapters);

      // Now set the edit state directly with the correct index and prepared form data
      setEditingChapterIndex(insertIndex);
      setEditFormData(newChapterFormData);
  };

  const handleDeleteChapter = (index: number) => {
      // Optional: Add confirmation dialog here
      // if (window.confirm(`Are you sure you want to delete Chapter ${index + 1}?`)) {
          const updatedChapters = chapters.filter((_, i) => i !== index);
          setChapters(updatedChapters);
          // If deleting the chapter currently being edited, cancel edit mode
          if (editingChapterIndex === index) {
              handleCancelEdit();
          }
      // }
  };
  // -------------------------

  // --- Save Plan Handler ---
  const handleSaveChanges = async () => {
      setIsSaving(true);
      setSaveError(null);
      setSaveSuccess(null);

      // Identify user for API call
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      // Check if anon user (this relies on anonUserIdentifier being available - needs passing down or fetching)
      // For now, let's assume we can get it or the API can infer from session
      // TODO: Pass anonUserIdentifier if needed, or rely on session cookie
      // const anonId = localStorage.getItem('storyWeaverAnonUserId');
      // if (anonId) {
      //    headers['X-User-Identifier'] = anonId;
      // }

      try {
          const response = await fetch(`/api/stories/${storyId}/chapters`, {
              method: 'POST',
              headers: headers, // Pass headers which might include X-User-Identifier
              body: JSON.stringify({ chapters: chapters }), // Send the current chapters array
          });

          const result = await response.json();

          if (!response.ok) {
              throw new Error(result.error || `API request failed with status ${response.status}`);
          }

          console.log("Save successful:", result);
          setSaveSuccess(`Successfully saved ${result.count} chapters!`);
          // Optionally close the overlay on success?
          // onClose(); 

      } catch (err: any) {
          console.error('Error saving chapter plan:', err);
          setSaveError(err.message || 'Failed to save chapter plan.');
          setSaveSuccess(null); // Clear success message on error
      } finally {
          setIsSaving(false);
          // Clear messages after a few seconds
          setTimeout(() => {
            setSaveError(null);
            setSaveSuccess(null);
          }, 5000);
      }
  };
  // -------------------------------------

  // --- Handler for Story Detail Changes ---
  const handleDetailChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const { name, value } = e.target;
      setStoryDetails(prev => ({
          ...prev,
          [name]: value,
      }));
  };

  const handleSaveStoryDetails = async () => {
      setIsSavingDetails(true);
      setSaveDetailsError(null);
      setSaveDetailsSuccess(null);

      const payload: Partial<EditableStoryDetails> = {};
      let changed = false;
      if (originalStoryDetails) {
          if (storyDetails.global_synopsis !== originalStoryDetails.global_synopsis) {
              payload.global_synopsis = storyDetails.global_synopsis.trim();
              changed = true;
          }
          if (storyDetails.global_style_note !== originalStoryDetails.global_style_note) {
              payload.global_style_note = storyDetails.global_style_note.trim();
              changed = true;
          }
          if (storyDetails.global_additional_notes !== originalStoryDetails.global_additional_notes) {
              payload.global_additional_notes = storyDetails.global_additional_notes.trim();
              changed = true;
          }
      }

      if (!changed) {
          setSaveDetailsSuccess("No changes detected.");
          setIsSavingDetails(false);
          setTimeout(() => setSaveDetailsSuccess(null), 3000);
          return;
      }

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      // Add auth header if needed (similar to chapter save)
      // const anonId = localStorage.getItem(ANON_USER_ID_KEY);
      // if (anonId) headers['X-User-Identifier'] = anonId;

      try {
          const response = await fetch(`/api/stories/${storyId}`, { // Use PATCH on the story itself
              method: 'PATCH',
              headers: headers,
              body: JSON.stringify(payload),
          });
          const result = await response.json();
          if (!response.ok) {
              throw new Error(result.error || `API request failed with status ${response.status}`);
          }
          setSaveDetailsSuccess("Story details saved successfully!");
          // Update original details to reflect saved state
          setOriginalStoryDetails(storyDetails);

      } catch (err: any) {
          console.error('Error saving story details:', err);
          setSaveDetailsError(err.message || 'Failed to save story details.');
      } finally {
          setIsSavingDetails(false);
          setTimeout(() => {
              setSaveDetailsError(null);
              setSaveDetailsSuccess(null);
          }, 5000);
      }
  };
  // -----------------------------------------

  // --- Drag and Drop Handler ---
  const onDragEnd = (result: DropResult) => {
      const { destination, source } = result;

      // Dropped outside the list
      if (!destination) {
          return;
      }

      // Dropped in the same place
      if (
          destination.droppableId === source.droppableId &&
          destination.index === source.index
      ) {
          return;
      }

      // Reorder logic
      const newChapters = Array.from(chapters);
      const [removed] = newChapters.splice(source.index, 1);
      newChapters.splice(destination.index, 0, removed);

      setChapters(newChapters);
  };
  // ---------------------------

  if (!isOpen) return null;

  const inputClasses = "w-full p-2 border border-gray-300/70 rounded-md shadow-sm focus:ring-1 focus:ring-slate-500 focus:border-slate-500 bg-white/90 placeholder-gray-400 transition duration-150 ease-in-out disabled:bg-gray-100 disabled:opacity-70";
  const labelClasses = "block text-sm font-medium text-gray-600 mb-1";
  const buttonClasses = "py-2 px-4 rounded-md text-sm font-medium transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 disabled:opacity-60 disabled:cursor-not-allowed";
  const smallButtonClasses = "py-1 px-2 rounded text-xs font-medium transition duration-150 ease-in-out focus:outline-none focus:ring-1 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";
  const loadingSpinner = (
    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );

  return (
    <div className="fixed inset-0 z-80 flex flex-col bg-gradient-to-br from-slate-50 via-stone-50 to-gray-100 text-gray-800 animate-fade-in p-6 sm:p-8 md:p-12">
        {/* Header Area */}
        <div className="flex justify-between items-center mb-6 sm:mb-8 flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-3">
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-700">Plan Chapters: <span className="font-bold">{storyTitle}</span></h1>
            {targetLength && <p className="text-sm text-slate-600 mt-1 sm:mt-0">Target Length: ~{targetLength.toLocaleString()} words</p>}
          </div>
          <button
              onClick={onClose} // Just close, don't save automatically
              className="text-gray-500 hover:text-gray-800 transition-colors p-1 rounded-full hover:bg-slate-200/50"
              aria-label="Close chapter planner"
              disabled={isLoading}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-grow overflow-y-auto pb-6 -mr-2 pr-2">
          {/* Global Story Details Section */}
          <div className="bg-white/60 backdrop-blur-sm rounded-lg shadow p-4 sm:p-6 border border-gray-200/50 mb-6 flex-shrink-0 space-y-4">
              <h2 className="text-md font-semibold text-slate-600">Global Story Details</h2>
              {/* Save Details Button & Status */}
              <div className="flex justify-between items-center pb-3 border-b border-slate-200/60">
                  <button
                      onClick={handleSaveStoryDetails}
                      disabled={isSavingDetails || !originalStoryDetails || JSON.stringify(storyDetails) === JSON.stringify(originalStoryDetails)}
                      className={`${buttonClasses} ${isSavingDetails ? 'bg-purple-400' : 'bg-purple-600 hover:bg-purple-700'} text-white min-w-[160px] text-center`}
                      title={JSON.stringify(storyDetails) === JSON.stringify(originalStoryDetails) ? "No changes to save" : "Save global story details"}
                  >
                      {isSavingDetails ? loadingSpinner : null}
                      {isSavingDetails ? 'Saving Details...' : 'Save Story Details'}
                  </button>
                  <div className="text-sm ml-4 flex-shrink min-w-0">
                      {saveDetailsError && <p className="text-red-600 truncate" title={saveDetailsError}>Error: {saveDetailsError}</p>}
                      {saveDetailsSuccess && <p className="text-green-600 truncate">{saveDetailsSuccess}</p>}
                  </div>
              </div>
              {/* Editable Fields */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
                  <div className="lg:col-span-1">
                      <label htmlFor="global_synopsis" className={labelClasses}>Global Synopsis</label>
                      <textarea
                          id="global_synopsis"
                          name="global_synopsis"
                          rows={6}
                          value={storyDetails.global_synopsis}
                          onChange={handleDetailChange}
                          className={`${inputClasses} min-h-[100px]`}
                          placeholder="Overall plot, characters, setting..."
                          disabled={isSavingDetails}
                      />
                  </div>
                  <div className="lg:col-span-1">
                      <label htmlFor="global_style_note" className={labelClasses}>Global Style Note</label>
                      <textarea
                          id="global_style_note"
                          name="global_style_note"
                          rows={6}
                          value={storyDetails.global_style_note}
                          onChange={handleDetailChange}
                          className={`${inputClasses} min-h-[100px]`}
                          placeholder="Tone, prose style, POV..."
                          disabled={isSavingDetails}
                      />
                  </div>
                  <div className="lg:col-span-1">
                      <label htmlFor="global_additional_notes" className={labelClasses}>Global Additional Notes</label>
                      <textarea
                          id="global_additional_notes"
                          name="global_additional_notes"
                          rows={6}
                          value={storyDetails.global_additional_notes}
                          onChange={handleDetailChange}
                          className={`${inputClasses} min-h-[100px]`}
                          placeholder="World-building, constraints..."
                          disabled={isSavingDetails}
                      />
                  </div>
              </div>
          </div>

          {/* Generation / Modification Form Section */}
          <div className="bg-white/60 backdrop-blur-sm rounded-lg shadow p-4 sm:p-6 border border-gray-200/50 mb-6 flex-shrink-0">
              {/* Conditional Title */}
              <h2 className="text-md font-semibold text-slate-600 mb-4">
                  {chapters.length > 0 ? 'Modify Existing Chapter Plan' : 'Generate Initial Chapter Outlines'}
              </h2>
              {/* Use the renamed handler */}
              <form onSubmit={handlePlanUpdate} className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Number of Chapters - Maybe hide or make optional for modification? */}
                      {/* For now, keep it but maybe add context */}
                      <div className="md:col-span-1">
                          <label htmlFor="numChaptersToGenerate" className={labelClasses}>
                              {chapters.length > 0 ? 'Target Chapters (Optional Hint)' : 'Number of Chapters*'}
                          </label>
                          <input
                              type="number"
                              id="numChaptersToGenerate"
                              value={numChaptersToGenerate}
                              onChange={(e) => setNumChaptersToGenerate(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                              className={`${inputClasses} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                              placeholder={chapters.length > 0 ? "e.g., 25" : "e.g., 20"}
                              required={chapters.length === 0} // Only required for initial generation
                              min="1"
                              max="150" // Consistent max limit
                              disabled={isLoading}
                          />
                          {chapters.length > 0 && <p className="text-xs text-slate-500 mt-1">AI will try to adjust the plan based on your instructions, using this number as a guideline.</p>}
                      </div>

                      {/* Planning / Modification Notes */}
                      <div className="md:col-span-2">
                          <label htmlFor="planningNotes" className={labelClasses}>
                              {chapters.length > 0 ? 'Modification Instructions' : 'Overall Planning Notes (Optional)'}
                          </label>
                          <input
                              type="text"
                              id="planningNotes" // Use the renamed state variable
                              value={planningNotes} // Use the renamed state variable
                              onChange={(e) => setPlanningNotes(e.target.value)} // Use the renamed setter
                              className={inputClasses}
                              placeholder={chapters.length > 0 ? "e.g., Combine chapters 2 & 3, add more detail to chapter 5..." : "e.g., Focus on world-building early..."}
                              disabled={isLoading}
                              maxLength={500} // Keep maxLength
                          />
                           {chapters.length > 0 && !planningNotes.trim() && <p className="text-xs text-amber-600 mt-1">Provide clear instructions for how to change the current plan.</p>}
                      </div>
                  </div>
                  <div className="flex justify-end">
                      {/* Conditional Button Text */}
                      <button
                          type="submit"
                          // Adjust disabled condition slightly for modification (allow if instructions are given, even if numChapters is blank)
                          disabled={isLoading || (chapters.length === 0 && (!numChaptersToGenerate || numChaptersToGenerate <= 0)) }
                          className={`${buttonClasses} ${chapters.length > 0 ? 'bg-orange-600 hover:bg-orange-700' : 'bg-indigo-600 hover:bg-indigo-700'} text-white min-w-[160px] text-center`}
                      >
                          {isLoading ? loadingSpinner : null}
                          {isLoading ? (chapters.length > 0 ? 'Modifying...' : 'Generating...') : (chapters.length > 0 ? 'Modify Plan' : 'Generate Outline')}
                      </button>
                  </div>
              </form>
              {/* Loading/Error messages remain largely the same, maybe slightly adjust text if needed */}
              {isLoading && (
                  <p className="text-slate-500 text-sm mt-4 flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-slate-500 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {chapters.length > 0 ? 'Applying modifications...' : 'Generating chapter outlines...'} this may take a minute.
                  </p>
              )}
              {generationError && (
                  <p className="text-red-600 bg-red-100 p-2 rounded border border-red-300 text-sm mt-3">Error: {generationError}</p>
              )}
          </div>

          {/* Display Existing/Generated Chapters */}
          <div className="space-y-4 mt-6">
              <h3 className="text-lg font-semibold text-slate-700 mb-3 flex-shrink-0">Chapter Plan ({chapters.length})</h3>

              {loadingExistingChapters && (
                  <div className="text-center text-slate-500 py-4">Loading existing chapter plan...</div>
              )}

              {!loadingExistingChapters && error && (
                  <div className="text-center text-red-600 bg-red-100 border border-red-300 p-3 rounded-md">
                      Error loading chapters: {error}
                  </div>
              )}

              {!loadingExistingChapters && !error && chapters.length === 0 && (
                  <div className="text-center text-slate-500 py-4 italic">
                      No chapters found or generated yet. Use the generator above or add chapters manually.
                  </div>
              )}

              {!loadingExistingChapters && chapters.length > 0 && (
                  <DragDropContext onDragEnd={onDragEnd}>
                      <Droppable droppableId="chapterList">
                          {(provided) => (
                              <div
                                  {...provided.droppableProps}
                                  ref={provided.innerRef}
                                  className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 rounded-md border border-slate-200/80 bg-white/50 p-4 shadow-inner"
                              >
                                  {chapters.map((chapter, index) => (
                                      <Draggable key={chapter.id || `new-${index}`} draggableId={chapter.id || `new-${index}`} index={index}>
                                          {(provided, snapshot) => (
                                              <div 
                                                  ref={provided.innerRef}
                                                  {...provided.draggableProps}
                                                  className={`relative p-3 rounded-md border border-slate-200/80 bg-white/90 hover:bg-white shadow-sm ${snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-400' : ''}`}
                                              >
                                                  {/* Drag Handle (Optional - a specific area to grab) */}
                                                  <div {...provided.dragHandleProps} className="absolute top-2 left-2 text-slate-400 hover:text-slate-600 cursor-grab p-1" title="Drag to reorder">
                                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                                                      </svg>
                                                  </div>

                                                  {/* Edit/Display Toggle */}
                                                  {editingChapterIndex === index && editFormData ? (
                                                      <div className="pl-8 space-y-3">
                                                          <div>
                                                              <label htmlFor={`edit-title-${index}`} className={labelClasses}>Title*</label>
                                                              <input
                                                                  type="text"
                                                                  id={`edit-title-${index}`}
                                                                  name="title"
                                                                  value={editFormData.title}
                                                                  onChange={handleEditFormChange}
                                                                  className={inputClasses}
                                                                  required
                                                              />
                                                          </div>
                                                          <div>
                                                              <label htmlFor={`edit-synopsis-${index}`} className={labelClasses}>Synopsis*</label>
                                                              <textarea
                                                                  id={`edit-synopsis-${index}`}
                                                                  name="synopsis"
                                                                  rows={4}
                                                                  value={editFormData.synopsis}
                                                                  onChange={handleEditFormChange}
                                                                  className={inputClasses}
                                                                  required
                                                              />
                                                          </div>
                                                          <div>
                                                              <label htmlFor={`edit-style_notes-${index}`} className={labelClasses}>Style Notes (Optional)</label>
                                                              <textarea
                                                                  id={`edit-style_notes-${index}`}
                                                                  name="style_notes"
                                                                  rows={2}
                                                                  value={editFormData.style_notes}
                                                                  onChange={handleEditFormChange}
                                                                  className={inputClasses}
                                                              />
                                                          </div>
                                                          <div>
                                                              <label htmlFor={`edit-additional_notes-${index}`} className={labelClasses}>Additional Notes (Optional)</label>
                                                              <textarea
                                                                  id={`edit-additional_notes-${index}`}
                                                                  name="additional_notes"
                                                                  rows={2}
                                                                  value={editFormData.additional_notes}
                                                                  onChange={handleEditFormChange}
                                                                  className={inputClasses}
                                                              />
                                                          </div>
                                                          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200/60 mt-3">
                                                              <button onClick={handleCancelEdit} className={`${smallButtonClasses} bg-gray-200 hover:bg-gray-300 text-gray-700`}>Cancel</button>
                                                              <button onClick={handleSaveEdit} className={`${smallButtonClasses} bg-blue-600 hover:bg-blue-700 text-white`}>Save Changes</button>
                                                          </div>
                                                      </div>
                                                  ) : (
                                                      <div className="flex justify-between items-start pl-8">
                                                          <div className="flex-grow pr-4 space-y-1">
                                                              <h4 className="text-md font-semibold text-slate-800">
                                                                  Chapter {index + 1}: {chapter.title || 'Untitled Chapter'}
                                                              </h4>
                                                              <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{chapter.synopsis || <span className="italic text-gray-500">No synopsis.</span>}</p>
                                                              {chapter.style_notes && <p className="text-xs text-gray-500 mt-2 italic">Style: {chapter.style_notes}</p>}
                                                              {chapter.additional_notes && <p className="text-xs text-gray-500 mt-1">Notes: {chapter.additional_notes}</p>}
                                                          </div>
                                                          <div className="flex flex-col space-y-2 flex-shrink-0">
                                                              <button 
                                                                  onClick={() => handleEditClick(index)} 
                                                                  className={`${smallButtonClasses} bg-white hover:bg-slate-100 text-slate-600 border border-slate-300`}
                                                                  disabled={editingChapterIndex !== null} // Disable if another edit is active
                                                              >
                                                                  Edit
                                                              </button>
                                                              <button 
                                                                  onClick={() => handleDeleteChapter(index)} 
                                                                  className={`${smallButtonClasses} bg-white hover:bg-red-50 text-red-600 border border-red-300`}
                                                                  disabled={editingChapterIndex !== null} // Disable if an edit is active
                                                              >
                                                                  Delete
                                                              </button>
                                                          </div>
                                                      </div>
                                                  )}
                                              </div>
                                          )}
                                      </Draggable>
                                  ))}
                                  {provided.placeholder}
                              </div>
                          )}
                      </Droppable>
                  </DragDropContext>
              )}
          </div>
        </div>

        {/* Footer Area */}
        <div className="mt-auto pt-6 flex justify-between items-center space-x-4 flex-shrink-0 border-t border-slate-200/60">
           {/* Save Status Messages */} 
           <div className="text-sm flex-grow min-w-0">
                {saveError && <p className="text-red-600 truncate" title={saveError}>Error: {saveError}</p>}
                {saveSuccess && <p className="text-green-600 truncate">{saveSuccess}</p>}
           </div>
           {/* Buttons */}
           <div className="flex space-x-4 flex-shrink-0">
             <button
                  onClick={handleSaveChanges}
                  disabled={isLoading || editingChapterIndex !== null || isSaving} // Disable if loading, editing, or already saving
                  className={`${buttonClasses} ${isSaving ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'} text-white min-w-[110px] text-center`}
                  title={editingChapterIndex !== null ? "Finish editing chapter before saving" : (isSaving ? "Saving..." : "Save chapter plan")}
              >
                  {isSaving ? loadingSpinner : null}
                  {isSaving ? 'Saving...' : 'Save Plan'}
              </button>
               <button
                   onClick={onClose} // Changed to simple close
                   disabled={isLoading}
                   className={`${buttonClasses} bg-white hover:bg-slate-50 text-gray-700 border border-gray-300`}
               >
                   Close
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
            /* Style for the details summary arrow */
            details > summary {
                list-style: none; /* Remove default marker */
                -webkit-tap-highlight-color: transparent; /* Prevent tap highlight on mobile */
            }
            details > summary::-webkit-details-marker {
                display: none; /* Remove default marker (Chrome) */
            }
            details[open] > summary .details-arrow {
                transform: rotate(180deg);
            }
        `}</style>
    </div>
  );
}