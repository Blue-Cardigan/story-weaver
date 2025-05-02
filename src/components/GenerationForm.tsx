// src/components/GenerationForm.tsx
import React, { useState, useEffect, useRef } from 'react';
import type { Database } from '@/types/supabase'; // Assuming types are accessible
import type { ChapterUpdatePayload } from '@/components/EditChapterModal'; // Reuse the type

// --- Custom Hook for Textarea Resizing ---
function useAutoResizeTextArea(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
    useEffect(() => {
        if (ref.current) {
            ref.current.style.height = 'auto'; // Reset height
            ref.current.style.height = `${ref.current.scrollHeight}px`; // Set to scroll height
        }
    }, [ref, value]);
}
// --- End Custom Hook ---

interface GenerationFormProps {
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  activeStoryDetails: Database['public']['Tables']['stories']['Row'] | null;
  synopsis: string;
  setSynopsis: (value: string) => void;
  styleNote: string;
  setStyleNote: (value: string) => void;
  partInstructions: string;
  setPartInstructions: (value: string) => void;
  length: number | '';
  setLength: (value: number | '') => void;
  useWebSearch: boolean;
  setUseWebSearch: (value: boolean) => void;
  includeGlobalStyleNote: boolean;
  setIncludeGlobalStyleNote: (value: boolean) => void;
  isLoading: boolean;
  isAccepting: boolean;
  isLoadingStoryDetails: boolean;
  isLoadingChapters: boolean;
  handleUnloadStory: () => void;
  activeStoryId: string | null;
  fetchedChapters: Database['public']['Tables']['chapters']['Row'][];
  chaptersError: string | null;
  selectedChapterId: string | null;
  setSelectedChapterId: (value: string | null) => void;
  isAddingChapter: boolean;
  newChapterNumber: number | '';
  setNewChapterNumber: (value: number | '') => void;
  newChapterTitle: string;
  setNewChapterTitle: (value: string) => void;
  newChapterSynopsis: string;
  setNewChapterSynopsis: (value: string) => void;
  addChapterError: string | null;
  handleAddChapterClick: () => Promise<void>;
  handleUpdateChapter: (chapterId: string, payload: ChapterUpdatePayload) => Promise<void>;
  isUpdatingChapter: boolean;
  updateChapterError: string | null;
  currentStoryParts: Database['public']['Tables']['story_generations']['Row'][];
}

const GenerationForm: React.FC<GenerationFormProps> = ({
  handleSubmit,
  activeStoryDetails,
  synopsis,
  setSynopsis,
  styleNote,
  setStyleNote,
  partInstructions,
  setPartInstructions,
  length,
  setLength,
  useWebSearch,
  setUseWebSearch,
  includeGlobalStyleNote,
  setIncludeGlobalStyleNote,
  isLoading,
  isAccepting,
  isLoadingStoryDetails,
  isLoadingChapters,
  handleUnloadStory,
  activeStoryId,
  fetchedChapters,
  chaptersError,
  selectedChapterId,
  setSelectedChapterId,
  isAddingChapter,
  newChapterNumber,
  setNewChapterNumber,
  newChapterTitle,
  setNewChapterTitle,
  newChapterSynopsis,
  setNewChapterSynopsis,
  addChapterError,
  handleAddChapterClick,
  handleUpdateChapter,
  isUpdatingChapter,
  updateChapterError,
  currentStoryParts,
}) => {

    const nextChapterNum = (fetchedChapters[fetchedChapters.length - 1]?.chapter_number || 0) + 1;
    const selectedChapterDetails = fetchedChapters.find(c => c.id === selectedChapterId);

    // --- State for inline chapter editing ---
    const [editingChapterTitle, setEditingChapterTitle] = useState('');
    const [editingChapterSynopsis, setEditingChapterSynopsis] = useState('');
    const [editingChapterStyleNotes, setEditingChapterStyleNotes] = useState('');
    // --- End state for inline chapter editing ---

    // --- Refs for Resizing Textareas ---
    const synopsisRef = useRef<HTMLTextAreaElement>(null);
    const styleNoteRef = useRef<HTMLTextAreaElement>(null);
    const partInstructionsRef = useRef<HTMLTextAreaElement>(null);
    const editingSynopsisRef = useRef<HTMLTextAreaElement>(null);
    const editingStyleNotesRef = useRef<HTMLTextAreaElement>(null);
    const newChapterSynopsisRef = useRef<HTMLTextAreaElement>(null);
    // --- End Refs ---

    // --- Apply Resizing Hook ---
    useAutoResizeTextArea(synopsisRef, synopsis); // For new story synopsis
    useAutoResizeTextArea(styleNoteRef, styleNote); // For new story style note
    useAutoResizeTextArea(partInstructionsRef, partInstructions);
    useAutoResizeTextArea(editingSynopsisRef, editingChapterSynopsis);
    useAutoResizeTextArea(editingStyleNotesRef, editingChapterStyleNotes);
    useAutoResizeTextArea(newChapterSynopsisRef, newChapterSynopsis); // For add new chapter synopsis
    // --- End Apply Hook ---

    // Reset editing state and potentially prefill instructions when selected chapter changes
    useEffect(() => {
        if (selectedChapterDetails) {
            setEditingChapterTitle(selectedChapterDetails.title || '');
            setEditingChapterSynopsis(selectedChapterDetails.synopsis || '');
            setEditingChapterStyleNotes(selectedChapterDetails.style_notes || '');

            if (partInstructions.trim() === '') {
                setPartInstructions(selectedChapterDetails.additional_notes || '');
            }
        } else {
            setEditingChapterTitle('');
            setEditingChapterSynopsis('');
            setEditingChapterStyleNotes('');
            if (activeStoryDetails?.structure_type === 'book') {
                // setPartInstructions(''); // Keeping instructions potentially
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedChapterId, selectedChapterDetails]); // Still depends on these

    const handleSaveChapterChanges = async () => {
        if (!selectedChapterId || !selectedChapterDetails) return;

        const payload: ChapterUpdatePayload = {};

        const currentTitle = selectedChapterDetails.title || null;
        const newTitle = editingChapterTitle.trim() || null;
        if (newTitle !== currentTitle) {
            payload.title = newTitle;
        }

        const currentSynopsis = selectedChapterDetails.synopsis || null;
        const newSynopsis = editingChapterSynopsis.trim() || null;
        if (newSynopsis !== currentSynopsis) {
            payload.synopsis = newSynopsis;
        }

        const currentStyleNotes = selectedChapterDetails.style_notes || null;
        const newStyleNotes = editingChapterStyleNotes.trim() || null;
        if (newStyleNotes !== currentStyleNotes) {
            payload.style_notes = newStyleNotes;
        }

        if (Object.keys(payload).length > 0) {
            try {
                await handleUpdateChapter(selectedChapterId, payload);
            } catch (error) {
                console.error("Error saving chapter from form:", error);
            }
        } else {
            console.log("No changes detected in chapter details.");
        }
    };


  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {activeStoryDetails ? (
        <>
          {/* Chapters Section (if book) */}
          {activeStoryDetails.structure_type === 'book' && (
            <div className="space-y-4 p-4 bg-blue-50/40 rounded-lg border border-blue-200/60">
              <h3 className="text-lg font-semibold text-blue-800">Chapters</h3>
              {isLoadingChapters && <p className="text-slate-500 text-sm">Loading chapters...</p>}
              {chaptersError && <p className="text-red-600 text-sm">Error loading chapters: {chaptersError}</p>}
              {!isLoadingChapters && !chaptersError && (
                <div className="space-y-3">
                  {/* Chapter Select Dropdown */}
                  <div>
                    <label htmlFor="chapterSelect" className="block text-sm font-medium text-gray-700 mb-1">Select Chapter</label>
                    <select
                      id="chapterSelect"
                      value={selectedChapterId || ''}
                      onChange={(e) => setSelectedChapterId(e.target.value || null)}
                      className="w-full p-2 border border-gray-300/70 rounded-md shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white/90 disabled:bg-gray-100"
                      disabled={isAddingChapter || isLoading || isUpdatingChapter}
                    >
                      <option value="">-- Select a Chapter --</option>
                      {fetchedChapters.map(ch => (
                        <option key={ch.id} value={ch.id}>
                          Ch. {ch.chapter_number}{ch.title ? `: ${ch.title}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* --- Inline Edit for Selected Chapter --- */}
                  {selectedChapterId && (
                     <div className="mt-3 space-y-3 p-3 pt-1 bg-white/60 rounded border border-blue-200/80">
                       <h4 className="text-sm font-medium text-blue-700 pt-1">Selected Chapter Details</h4>
                         <div className="space-y-3">
                             <div>
                                 <label htmlFor="editingChapterTitle" className="block text-xs font-medium text-gray-600 mb-0.5">Title (Optional)</label>
                                 <input type="text" id="editingChapterTitle" value={editingChapterTitle} onChange={e => setEditingChapterTitle(e.target.value)} className="w-full p-1.5 text-sm border border-gray-300/70 rounded-md" disabled={isUpdatingChapter}/>
                             </div>
                             <div>
                                 <label htmlFor="editingChapterSynopsis" className="block text-xs font-medium text-gray-600 mb-0.5">Synopsis (Optional)</label>
                                 <textarea
                                    id="editingChapterSynopsis"
                                    ref={editingSynopsisRef}
                                    value={editingChapterSynopsis}
                                    onChange={e => setEditingChapterSynopsis(e.target.value)}
                                    className="w-full p-1.5 text-sm border border-gray-300/70 rounded-md resize-none overflow-hidden min-h-[4em]"
                                    style={{ height: 'auto' }}
                                    disabled={isUpdatingChapter}
                                  ></textarea>
                             </div>
                             <div>
                                 <label htmlFor="editingChapterStyleNotes" className="block text-xs font-medium text-gray-600 mb-0.5">Style Notes (Optional)</label>
                                 <textarea
                                    id="editingChapterStyleNotes"
                                    ref={editingStyleNotesRef}
                                    value={editingChapterStyleNotes}
                                    onChange={e => setEditingChapterStyleNotes(e.target.value)}
                                    className="w-full p-1.5 text-sm border border-gray-300/70 rounded-md resize-none overflow-hidden min-h-[4em]"
                                    style={{ height: 'auto' }}
                                    disabled={isUpdatingChapter}
                                  ></textarea>
                             </div>
                             {updateChapterError && <p className="text-xs text-red-600">{updateChapterError}</p>}
                             <div className="flex justify-end space-x-2">
                                 <button
                                     type="button"
                                     onClick={handleSaveChapterChanges}
                                     disabled={isUpdatingChapter || !selectedChapterDetails}
                                     className="py-1 px-3 text-xs border rounded bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50"
                                     title={!selectedChapterDetails ? "Select a chapter first" : (isUpdatingChapter ? "Saving..." : "Save any changes to chapter details")}
                                 >
                                     {isUpdatingChapter ? 'Saving...' : 'Save Chapter Details'}
                                 </button>
                             </div>
                         </div>
                     </div>
                  )}
                  {/* --- End Inline Edit --- */}

                  {/* --- Add New Chapter Details --- */}
                  <details className="group pt-2">
                    <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-800 list-none inline-flex items-center">
                       <span className="group-open:hidden">+ Add New Chapter</span>
                       <span className="hidden group-open:inline">▼ Add New Chapter</span>
                    </summary>
                    <div className="mt-3 space-y-3 p-3 bg-white/60 rounded border border-blue-200/80">
                       <div>
                         <label htmlFor="newChapterNumber" className="block text-xs font-medium text-gray-600 mb-0.5">Chapter Number*</label>
                         <input type="number" id="newChapterNumber" value={newChapterNumber} onChange={e => setNewChapterNumber(e.target.value === '' ? '' : parseInt(e.target.value))} min="1" className="w-full p-1.5 text-sm border border-gray-300/70 rounded-md" placeholder={`Next: ${nextChapterNum}`} />
                       </div>
                       <div>
                         <label htmlFor="newChapterTitle" className="block text-xs font-medium text-gray-600 mb-0.5">Title (Optional)</label>
                         <input type="text" id="newChapterTitle" value={newChapterTitle} onChange={e => setNewChapterTitle(e.target.value)} className="w-full p-1.5 text-sm border border-gray-300/70 rounded-md" />
                       </div>
                       <div>
                         <label htmlFor="newChapterSynopsis" className="block text-xs font-medium text-gray-600 mb-0.5">Synopsis (Optional)</label>
                         <textarea
                            id="newChapterSynopsis"
                            ref={newChapterSynopsisRef}
                            value={newChapterSynopsis}
                            onChange={e => setNewChapterSynopsis(e.target.value)}
                            className="w-full p-1.5 text-sm border border-gray-300/70 rounded-md resize-none overflow-hidden min-h-[3em]"
                            style={{ height: 'auto' }}
                          ></textarea>
                       </div>
                       {addChapterError && <p className="text-xs text-red-600">{addChapterError}</p>}
                       <div className="flex justify-end">
                         <button type="button" onClick={handleAddChapterClick} disabled={isAddingChapter || !newChapterNumber || isUpdatingChapter} className="py-1 px-3 text-xs border rounded bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50">
                           {isAddingChapter ? 'Adding...' : 'Add Chapter'}
                         </button>
                       </div>
                    </div>
                  </details>
                  {/* --- End Add New Chapter --- */}
                </div>
              )}
            </div>
          )}

          {/* Instructions for Next Part */}
          <div>
            <label htmlFor="partInstructions" className="block text-sm font-medium text-gray-700 mb-1">
              Instructions for Next Part {selectedChapterDetails ? `(Chapter ${selectedChapterDetails.chapter_number})` : ''}
            </label>
            <textarea
              id="partInstructions"
              ref={partInstructionsRef}
              name="partInstructions"
              className="w-full p-3 border border-gray-300/70 rounded-lg shadow-sm focus:ring-1 focus:ring-slate-500 focus:border-slate-500 bg-white/80 placeholder-gray-400 transition duration-150 ease-in-out resize-none overflow-hidden min-h-[6em]"
              style={{ height: 'auto' }}
              placeholder="Describe what should happen in this section... (Chapter notes may be pre-filled here)"
              value={partInstructions}
              onChange={(e) => setPartInstructions(e.target.value)}
              required={!activeStoryId || currentStoryParts.length === 0}
            />
          </div>
        </>
      ) : (
        <>
          {/* Synopsis (New Story) */}
          <div>
            <label htmlFor="synopsis" className="block text-sm font-medium text-gray-700 mb-1">Synopsis</label>
            <textarea
              id="synopsis"
              ref={synopsisRef}
              name="synopsis"
              className="w-full p-3 border border-gray-300/70 rounded-lg shadow-sm focus:ring-1 focus:ring-slate-500 focus:border-slate-500 bg-white/80 placeholder-gray-400 transition duration-150 ease-in-out resize-none overflow-hidden min-h-[6em]"
              style={{ height: 'auto' }}
              placeholder="A lone astronaut discovers an ancient artifact on Mars..."
              value={synopsis} onChange={(e) => setSynopsis(e.target.value)} required
            />
          </div>
          {/* Style Note (New Story) */}
          <div>
            <label htmlFor="styleNote" className="block text-sm font-medium text-gray-700 mb-1">Style Note</label>
            <textarea
              id="styleNote"
              ref={styleNoteRef}
              name="styleNote"
              className="w-full p-3 border border-gray-300/70 rounded-lg shadow-sm focus:ring-1 focus:ring-slate-500 focus:border-slate-500 bg-white/80 placeholder-gray-400 transition duration-150 ease-in-out resize-none overflow-hidden min-h-[4em]"
              style={{ height: 'auto' }}
              placeholder="Evoke a sense of cosmic horror and isolation, minimalist prose..."
              value={styleNote} onChange={(e) => setStyleNote(e.target.value)} required
            />
          </div>
        </>
      )}

      {/* Common Fields: Length, Web Search, and Global Style Note Toggle */}
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
        <div className="flex items-center justify-start md:justify-end md:pt-7 space-x-6">
          {/* Web Search Checkbox */}
          <div className="flex items-center">
            <div className="flex items-center h-5">
              <input id="useWebSearch" name="useWebSearch" type="checkbox"
                checked={useWebSearch} onChange={(e) => setUseWebSearch(e.target.checked)}
                className="focus:ring-slate-500 h-4 w-4 text-slate-600 border-gray-300/70 rounded transition duration-150 ease-in-out"
              />
            </div>
            <div className="ml-3 text-sm">
              <label htmlFor="useWebSearch" className="font-medium text-gray-700">Use Web Search</label>
              <p id="useWebSearch-description" className="text-xs text-gray-500">Allow AI to search the web.</p>
            </div>
          </div>
          {/* Global Style Note Checkbox (Only show if active story exists) */}
          {activeStoryDetails && (
            <div className="flex items-center">
                <div className="flex items-center h-5">
                <input id="includeGlobalStyleNote" name="includeGlobalStyleNote" type="checkbox"
                    checked={includeGlobalStyleNote}
                    onChange={(e) => setIncludeGlobalStyleNote(e.target.checked)}
                    className="focus:ring-slate-500 h-4 w-4 text-slate-600 border-gray-300/70 rounded transition duration-150 ease-in-out"
                />
                </div>
                <div className="ml-3 text-sm">
                <label htmlFor="includeGlobalStyleNote" className="font-medium text-gray-700">Include Global Style</label>
                <p id="includeGlobalStyleNote-description" className="text-xs text-gray-500">Use the story's main style note.</p>
                </div>
            </div>
           )}
        </div>
      </div>

      {/* Form Submission Area */}
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
        {!activeStoryId && <div />} {/* Placeholder to keep button alignment */}

        <button
          type="submit"
          disabled={isLoading || isAccepting || isLoadingStoryDetails || isLoadingChapters || isUpdatingChapter ||
              (activeStoryDetails?.structure_type === 'book' && !selectedChapterId && currentStoryParts.some(p => p.chapter_id))}
          className={`inline-flex justify-center py-2 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white transition duration-150 ease-in-out ${
              (isLoading || isAccepting || isLoadingStoryDetails || isLoadingChapters || isUpdatingChapter || (activeStoryDetails?.structure_type === 'book' && !selectedChapterId && currentStoryParts.some(p => p.chapter_id)))
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-slate-600 to-gray-800 hover:from-slate-700 hover:to-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500'
          }`}
          title={ (activeStoryDetails?.structure_type === 'book' && !selectedChapterId && currentStoryParts.some(p => p.chapter_id)) ? 'Please select a chapter' : (isUpdatingChapter ? 'Saving chapter changes...' : '')}
        >
          {isLoading ? (
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg>
          ) : null}
          {isLoading ? 'Weaving...' : (activeStoryId ? 'Generate Next Part' : 'Generate Story Section')}
        </button>
      </div>
    </form>
  );
};

export default GenerationForm;
