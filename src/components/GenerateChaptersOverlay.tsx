'use client'

import React, { useState } from 'react';
import { Database } from '@/types/supabase';

type ChapterOutline = {
  title: string;
  synopsis: string;
  style_notes?: string;
  additional_notes?: string;
  chapter_number?: number; // Added locally after generation maybe
};

interface GenerateChaptersOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  storyId: string;
  storyTitle: string;
  globalSynopsis?: string | null;
  globalStyleNote?: string | null;
  globalAdditionalNotes?: string | null;
  targetLength?: number | null;
}

export default function GenerateChaptersOverlay({
  isOpen,
  onClose,
  storyId,
  storyTitle,
  globalSynopsis,
  globalStyleNote,
  globalAdditionalNotes,
  targetLength,
}: GenerateChaptersOverlayProps) {
  const [numChapters, setNumChapters] = useState<number | ''>('');
  const [generationNotes, setGenerationNotes] = useState('');
  const [generatedChapters, setGeneratedChapters] = useState<ChapterOutline[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateChapters = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!numChapters || numChapters <= 0 || isLoading) return;

    setIsLoading(true);
    setError(null);
    setGeneratedChapters([]); // Clear previous results

    try {
      const response = await fetch('/api/generate-chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          numChapters: Number(numChapters),
          targetBookLength: targetLength,
          generationNotes: generationNotes.trim() || undefined,
          // Pass global context for the AI
          globalSynopsis: globalSynopsis || undefined,
          globalStyleNote: globalStyleNote || undefined,
          globalAdditionalNotes: globalAdditionalNotes || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Generated Chapters Data:", data); // Log received data

      // Ensure data.chapters is an array before setting state
      if (Array.isArray(data.chapters)) {
        setGeneratedChapters(data.chapters);
      } else {
        console.error("Received non-array data for chapters:", data.chapters);
        throw new Error("Invalid chapter data received from server.");
      }

    } catch (err: any) {
      console.error('Error generating chapters:', err);
      setError(err.message || 'Failed to generate chapters.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const inputClasses = "w-full p-2 border border-gray-300/70 rounded-md shadow-sm focus:ring-1 focus:ring-slate-500 focus:border-slate-500 bg-white/80 placeholder-gray-400 transition duration-150 ease-in-out disabled:bg-gray-100";
  const labelClasses = "block text-sm font-medium text-gray-700 mb-1";
  const buttonClasses = "py-2 px-4 rounded-md text-sm font-medium transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 disabled:opacity-60 disabled:cursor-not-allowed";
  const loadingSpinner = (
    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

  return (
    <div className="fixed inset-0 z-80 flex items-center justify-center bg-black/50 backdrop-blur-md animate-fade-in-fast">
      <div className="bg-gradient-to-br from-slate-50 to-gray-100 p-6 rounded-lg shadow-xl w-full max-w-2xl border border-gray-200/50 relative max-h-[90vh] flex flex-col">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-800 transition-colors p-1 rounded-full hover:bg-slate-200/60"
          aria-label="Close chapter generation"
          disabled={isLoading}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-xl font-semibold text-slate-800 mb-3">Plan Chapters for "{storyTitle}"</h2>
        {targetLength && <p className="text-sm text-slate-600 mb-4">Target Length: ~{targetLength.toLocaleString()} words</p>}

        <form onSubmit={handleGenerateChapters} className="space-y-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div className="md:col-span-1">
                 <label htmlFor="numChapters" className={labelClasses}>Number of Chapters*</label>
                 <input
                     type="number"
                     id="numChapters"
                     value={numChapters}
                     onChange={(e) => setNumChapters(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                     className={`${inputClasses} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                     placeholder="e.g., 20"
                     required
                     min="1"
                     max="100" // Sensible limit?
                     disabled={isLoading}
                 />
             </div>
             <div className="md:col-span-2">
                <label htmlFor="generationNotes" className={labelClasses}>Overall Chapter Planning Notes (Optional)</label>
                <input
                    type="text"
                    id="generationNotes"
                    value={generationNotes}
                    onChange={(e) => setGenerationNotes(e.target.value)}
                    className={inputClasses}
                    placeholder="e.g., Focus on world-building early, introduce antagonist by chapter 5"
                    disabled={isLoading}
                    maxLength={500}
                />
             </div>
          </div>


          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-200/60">
             {/* Maybe add a 'Clear' button? */}
             <button
                type="submit"
                disabled={isLoading || !numChapters || numChapters <= 0}
                className={`${buttonClasses} bg-indigo-600 hover:bg-indigo-700 text-white min-w-[150px] text-center`}
             >
                {isLoading ? loadingSpinner : null}
                {isLoading ? 'Generating...' : 'Generate Chapters'}
             </button>
          </div>
        </form>

        {/* Results Area */}
        <div className="flex-grow overflow-y-auto border border-gray-200 rounded-md p-4 bg-white/60 shadow-inner min-h-[200px]">
          {isLoading && (
            <div className="flex justify-center items-center h-full">
                <p className="text-slate-500 flex items-center">
                    {loadingSpinner} Generating chapter outlines... this may take a minute.
                </p>
            </div>
           )}
          {error && (
            <div className="flex justify-center items-center h-full">
                 <p className="text-red-600 bg-red-100 p-3 rounded border border-red-300">{error}</p>
            </div>
          )}
          {!isLoading && !error && generatedChapters.length === 0 && (
            <div className="flex justify-center items-center h-full">
                 <p className="text-slate-400">Chapter outlines will appear here after generation.</p>
             </div>
          )}
          {generatedChapters.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-slate-700 mb-3">Generated Chapter Outlines ({generatedChapters.length})</h3>
              <ul className="space-y-4">
                {generatedChapters.map((chapter, index) => (
                  <li key={index} className="pb-3 border-b border-slate-200/80 last:border-b-0">
                    <p className="font-semibold text-slate-800">Chapter {chapter.chapter_number || index + 1}: {chapter.title || 'Untitled Chapter'}</p>
                    <p className="text-sm text-gray-700 mt-1">{chapter.synopsis || 'No synopsis provided.'}</p>
                    {chapter.style_notes && <p className="text-xs text-gray-500 mt-1 italic">Style: {chapter.style_notes}</p>}
                    {chapter.additional_notes && <p className="text-xs text-gray-500 mt-1">Notes: {chapter.additional_notes}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="pt-4 border-t border-slate-200/60 mt-4 flex justify-end">
             <button
                 onClick={onClose}
                 disabled={isLoading}
                 className={`${buttonClasses} bg-white hover:bg-slate-50 text-gray-700 border border-gray-300`}
             >
                 {generatedChapters.length > 0 ? 'Done' : 'Close'}
             </button>
        </div>

      </div>
      {/* Re-use fade-in animation style */}
      <style jsx>{`
        @keyframes fade-in-fast {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in-fast {
          animation: fade-in-fast 0.2s ease-out forwards;
        }
      `}</style>
    </div>
  );
}