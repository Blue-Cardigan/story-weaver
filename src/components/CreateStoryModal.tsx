'use client'

import { Database } from '@/types/supabase';
import React, { useState, useEffect } from 'react';

type StoryStructure = Database['public']['Enums']['story_structure_type'];

interface CreateStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: { 
      title: string; 
      structure_type: StoryStructure; 
      global_synopsis?: string; 
      global_style_note?: string;
      target_length?: number;
  }) => Promise<void>; // Make async to handle API call status
  isCreating: boolean;
  createError: string | null;
}

export default function CreateStoryModal({ 
    isOpen, 
    onClose, 
    onSubmit, 
    isCreating,
    createError 
}: CreateStoryModalProps) {
  const [title, setTitle] = useState('');
  const [structureType, setStructureType] = useState<StoryStructure>('short_story');
  const [globalSynopsis, setGlobalSynopsis] = useState('');
  const [globalStyleNote, setGlobalStyleNote] = useState('');
  const [targetLength, setTargetLength] = useState<number | ''>('');

  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setStructureType('short_story');
      setGlobalSynopsis('');
      setGlobalStyleNote('');
      setTargetLength('');
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isCreating) return;

    await onSubmit({
      title: title.trim(),
      structure_type: structureType,
      global_synopsis: globalSynopsis.trim() || undefined,
      global_style_note: globalStyleNote.trim() || undefined,
      target_length: targetLength === '' ? undefined : Number(targetLength),
    });
    // Keep modal open on error, close on success (handled by parent)
  };

  if (!isOpen) return null;

  const inputClasses = "w-full p-2 border border-gray-300/70 rounded-md shadow-sm focus:ring-1 focus:ring-slate-500 focus:border-slate-500 bg-white/80 placeholder-gray-400 transition duration-150 ease-in-out";
  const labelClasses = "block text-sm font-medium text-gray-700 mb-1";
  const buttonClasses = "py-2 px-4 rounded-md text-sm font-medium transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 disabled:opacity-60 disabled:cursor-not-allowed";
  const loadingSpinner = (
      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
  );

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in-fast">
      <div className="bg-gradient-to-br from-gray-50 to-slate-100 p-6 rounded-lg shadow-xl w-full max-w-lg border border-gray-200/50 relative">
        {/* Close Button */} 
        <button 
            onClick={onClose} 
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 transition-colors p-1 rounded-full hover:bg-slate-200/50"
            aria-label="Close create story modal"
            disabled={isCreating}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-lg font-semibold text-slate-700 mb-4">Create New Story</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="title" className={labelClasses}>Title*</label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClasses}
              placeholder="My Awesome Sci-Fi Epic"
              required
              maxLength={150}
              disabled={isCreating}
            />
          </div>

          <div>
            <label htmlFor="structureType" className={labelClasses}>Structure Type</label>
            <select
              id="structureType"
              value={structureType}
              onChange={(e) => setStructureType(e.target.value as StoryStructure)}
              className={inputClasses}
              required
              disabled={isCreating}
            >
              <option value="short_story">Short Story</option>
              <option value="book">Book / Novel</option>
            </select>
          </div>

          <div>
            <label htmlFor="targetLength" className={labelClasses}>Target Story Length (approx words)</label>
            <input
              type="number"
              id="targetLength"
              name="targetLength"
              value={targetLength}
              onChange={(e) => setTargetLength(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
              className={`${inputClasses} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
              placeholder="e.g., 5000 (optional)"
              min="1"
              disabled={isCreating}
            />
          </div>

          <div>
            <label htmlFor="globalSynopsis" className={labelClasses}>Global Synopsis (Optional)</label>
            <textarea
              id="globalSynopsis"
              rows={3}
              value={globalSynopsis}
              onChange={(e) => setGlobalSynopsis(e.target.value)}
              className={inputClasses}
              placeholder="Overall plot, main characters, setting..."
              disabled={isCreating}
            />
          </div>

          <div>
            <label htmlFor="globalStyleNote" className={labelClasses}>Global Style Note (Optional)</label>
            <textarea
              id="globalStyleNote"
              rows={2}
              value={globalStyleNote}
              onChange={(e) => setGlobalStyleNote(e.target.value)}
              className={inputClasses}
              placeholder="Tone, prose style, point of view..."
              disabled={isCreating}
            />
          </div>

          {createError && (
            <p className="text-sm text-red-600 bg-red-100 p-2 rounded border border-red-300">{createError}</p>
          )}

          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200/60">
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className={`${buttonClasses} bg-white hover:bg-slate-50 text-gray-700 border border-gray-300`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !title.trim()}
              className={`${buttonClasses} bg-blue-600 hover:bg-blue-700 text-white`}
            >
              {isCreating ? loadingSpinner : null}
              {isCreating ? 'Creating...' : 'Create Story'}
            </button>
          </div>
        </form>
      </div>
      <style jsx>{`
        @keyframes fade-in-fast {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in-fast {
          animation: fade-in-fast 0.15s ease-out forwards;
        }
      `}</style>
    </div>
  );
} 