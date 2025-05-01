// src/components/StoryContentDisplay.tsx
import React from 'react';
import EditableText from '@/components/EditableText';
import type { Database } from '@/types/supabase'; // Assuming types are accessible

// Define a type for the grouped parts structure used in the main component
interface GroupedStoryParts {
    groups?: Record<string, Database['public']['Tables']['story_generations']['Row'][]>;
    chapterMap?: Map<string, Database['public']['Tables']['chapters']['Row']>;
    sortedGroupKeys?: string[];
}

interface StoryContentDisplayProps {
    activeStoryDetails: Database['public']['Tables']['stories']['Row'] | null;
    isLoadingStoryParts: boolean;
    storyPartsError: string | null;
    isLoadingChapters: boolean;
    currentStoryParts: Database['public']['Tables']['story_generations']['Row'][];
    groupedStoryParts: GroupedStoryParts;
    handleOpenEditChapterModal: (chapter: Database['public']['Tables']['chapters']['Row']) => void;
    storyPartsSavingStates: Record<string, { isLoading: boolean; error: string | null; success: boolean }>;
    handleStoryPartChange: (partId: string, newContent: string) => void;
    handleSaveChangesForPart: (partId: string) => Promise<void>;
}

const StoryContentDisplay: React.FC<StoryContentDisplayProps> = ({
    activeStoryDetails,
    isLoadingStoryParts,
    storyPartsError,
    isLoadingChapters,
    currentStoryParts,
    groupedStoryParts,
    handleOpenEditChapterModal,
    storyPartsSavingStates,
    handleStoryPartChange,
    handleSaveChangesForPart,
}) => {
    if (!activeStoryDetails) return null;

    const { groups, chapterMap, sortedGroupKeys } = groupedStoryParts;

    return (
        <div className={`w-full max-w-3xl bg-white/60 backdrop-blur-md rounded-xl shadow-lg p-8 border border-gray-200/40 transition-all duration-300 mb-8`}>
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

            {!isLoadingStoryParts && !storyPartsError && !isLoadingChapters && currentStoryParts.length > 0 && groups && chapterMap && sortedGroupKeys && (
                <div className="space-y-8 max-h-[70vh] overflow-y-auto pr-2 ">
                    {sortedGroupKeys.map((chapterKey) => {
                        const chapter = chapterMap.get(chapterKey);
                        const partsInGroup = groups[chapterKey] || [];

                        // Don't render a chapter section if it has no parts and isn't 'uncategorized'
                        if (partsInGroup.length === 0 && chapterKey !== 'uncategorized') return null;
                        // Don't render uncategorized if it has no parts
                        if (partsInGroup.length === 0 && chapterKey === 'uncategorized') return null;

                        return (
                            <section key={chapterKey} className="space-y-4">
                                {chapter && ( // Render chapter header if chapter exists
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
                                        {(chapter.synopsis || chapter.style_notes || chapter.additional_notes) && (
                                            <details className="text-xs text-gray-700 space-y-1 pb-1 cursor-pointer group">
                                                <summary className="list-none inline-flex items-center text-gray-500 group-open:mb-1">
                                                     <span className="group-open:hidden">Show Chapter Notes ▼</span>
                                                     <span className="hidden group-open:inline">Hide Chapter Notes ▲</span>
                                                </summary>
                                                <div className="pl-2 space-y-1 border-l-2 border-blue-100 ml-1">
                                                    {chapter.synopsis && (
                                                        <div><span className="font-medium text-gray-600">Synopsis:</span><p className="pl-2 whitespace-pre-wrap">{chapter.synopsis}</p></div>
                                                    )}
                                                    {chapter.style_notes && (
                                                        <div><span className="font-medium text-gray-600">Style:</span><p className="pl-2 whitespace-pre-wrap">{chapter.style_notes}</p></div>
                                                    )}
                                                    {chapter.additional_notes && (
                                                        <div><span className="font-medium text-gray-600">Notes:</span><p className="pl-2 whitespace-pre-wrap">{chapter.additional_notes}</p></div>
                                                    )}
                                                </div>
                                            </details>
                                        )}
                                    </div>
                                )}
                                {chapterKey === 'uncategorized' && partsInGroup.length > 0 && ( // Header for uncategorized parts
                                    <h3 className="text-lg font-semibold text-gray-600 border-b border-gray-200 pb-1 sticky top-0 bg-white/80 backdrop-blur-sm py-1 -mx-4 px-4 z-10">
                                        Uncategorized Parts
                                    </h3>
                                )}

                                {partsInGroup.map((part) => { // Render parts within the group
                                    const partSavingState = storyPartsSavingStates[part.id] || { isLoading: false, error: null, success: false };
                                    return (
                                        <div key={part.id} className={`ml-${chapter ? 4 : 0} rounded-lg border transition-shadow duration-150 ${part.is_accepted ? 'bg-green-50/70 border-green-200 shadow-sm' : 'bg-white/80 border-gray-200/80'}`}>
                                            <div className="flex justify-between items-center mb-2 px-4 pt-4">
                                                <p className="text-sm font-medium text-gray-800">
                                                    Part #{part.part_number}
                                                    {part.is_accepted && <span className="ml-1 text-xs font-semibold text-green-700 py-0.5 px-1.5 rounded bg-green-100 border border-green-200">[Latest Accepted]</span>}
                                                </p>
                                                <p className="text-xs text-gray-500">ID: {part.id?.substring(0, 8)}...</p>
                                            </div>
                                            <div className="px-4">
                                                <EditableText
                                                    value={part.generated_story || ''}
                                                    onChange={(newContent) => handleStoryPartChange(part.id, newContent)}
                                                    placeholder="Edit story content..."
                                                    className="bg-white/90 rounded-md border border-gray-300/50 focus-within:ring-1 focus-within:ring-slate-400 focus-within:border-slate-400 mb-2"
                                                    // Simple log for context selection in story parts for now
                                                    onContextSelectionChange={(indices) => console.log(`Context selected for part ${part.id}:`, indices)}
                                                />
                                            </div>
                                            <div className="mt-2 flex justify-end items-center space-x-3 px-4 pb-4">
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
    );
};

export default StoryContentDisplay;