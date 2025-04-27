'use client'

import { Database } from '@/types/supabase';
import React, { useState } from 'react';

type StoryStructure = Database['public']['Enums']['story_structure_type'];

interface CreateStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: { 
      title: string; 
      structure_type: StoryStructure; 
      global_synopsis?: string; 
      global_style_note?: string 
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isCreating) return;

    await onSubmit({
      title: title.trim(),
      structure_type: structureType,
      global_synopsis: globalSynopsis.trim() || undefined,
      global_style_note: globalStyleNote.trim() || undefined,
    });
    // Keep modal open on error, close on success (handled by parent)
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in-fast">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md m-4 relative border border-slate-300">
        {/* Close Button */} 
        <button 
            onClick={onClose} 
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            aria-label="Close create story modal"
            disabled={isCreating}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-xl font-semibold mb-4 text-slate-700">Create New Story</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="storyTitle" className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              id="storyTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              required
              disabled={isCreating}
              placeholder="My Awesome Novel"
            />
          </div>

          <div>
            <label htmlFor="structureType" className="block text-sm font-medium text-gray-700 mb-1">Structure *</label>
            <select
              id="structureType"
              value={structureType}
              onChange={(e) => setStructureType(e.target.value as StoryStructure)}
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:bg-gray-100"
              required
              disabled={isCreating}
            >
              <option value="short_story">Short Story (Single Narrative)</option>
              <option value="book">Book (Chapters/Parts)</option>
            </select>
          </div>

          <div>
            <label htmlFor="globalSynopsis" className="block text-sm font-medium text-gray-700 mb-1">Global Synopsis (Optional)</label>
            <textarea
              id="globalSynopsis"
              rows={3}
              value={globalSynopsis}
              onChange={(e) => setGlobalSynopsis(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              disabled={isCreating}
              placeholder="A brief overview of the entire story arc..."
            />
          </div>

          <div>
            <label htmlFor="globalStyleNote" className="block text-sm font-medium text-gray-700 mb-1">Global Style Note (Optional)</label>
            <textarea
              id="globalStyleNote"
              rows={3}
              value={globalStyleNote}
              onChange={(e) => setGlobalStyleNote(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              disabled={isCreating}
              placeholder="Overall tone, style, point of view..."
            />
          </div>

          {createError && (
            <p className="text-red-500 text-sm text-center">Error: {createError}</p>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className="py-2 px-4 mr-2 rounded-md text-sm font-medium border border-gray-300 hover:bg-gray-50 transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !title.trim()}
              className="py-2 px-4 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isCreating ? (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : null}
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