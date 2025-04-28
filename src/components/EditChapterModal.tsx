'use client';

import { useState, useEffect } from 'react';
import type { Database } from '@/types/supabase';

type DbChapter = Database['public']['Tables']['chapters']['Row'];

export interface ChapterUpdatePayload {
  chapter_number?: number;
  title?: string | null;
  synopsis?: string | null;
}

interface EditChapterModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapter: DbChapter | null; // Chapter being edited
  onSubmit: (chapterId: string, formData: ChapterUpdatePayload) => Promise<void>;
  isUpdating: boolean;
  updateError: string | null;
}

export default function EditChapterModal({
  isOpen,
  onClose,
  chapter,
  onSubmit,
  isUpdating,
  updateError,
}: EditChapterModalProps) {
  const [chapterNumber, setChapterNumber] = useState<number | ''>('');
  const [title, setTitle] = useState('');
  const [synopsis, setSynopsis] = useState('');

  // Pre-fill form when chapter data is available or changes
  useEffect(() => {
    if (chapter) {
      setChapterNumber(chapter.chapter_number ?? '');
      setTitle(chapter.title ?? '');
      setSynopsis(chapter.synopsis ?? '');
    } else {
      // Reset form if no chapter (e.g., modal closed)
      setChapterNumber('');
      setTitle('');
      setSynopsis('');
    }
  }, [chapter]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!chapter || isUpdating) return;

    const payload: ChapterUpdatePayload = {};
    if (chapterNumber !== '' && chapterNumber !== chapter.chapter_number) {
      payload.chapter_number = chapterNumber;
    }
    // Allow setting title/synopsis to empty string, which translates to null in the handler
    if (title !== (chapter.title ?? '')) {
      payload.title = title.trim() || null;
    }
    if (synopsis !== (chapter.synopsis ?? '')) {
      payload.synopsis = synopsis.trim() || null;
    }
    
    // Only submit if there are actual changes
    if (Object.keys(payload).length > 0) {
        await onSubmit(chapter.id, payload);
    } else {
        onClose(); // Close if no changes were made
    }
  };

  if (!isOpen || !chapter) return null;

  const loadingSpinner = (
    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
  const inputClasses = "w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white/90 text-sm disabled:opacity-70 disabled:bg-gray-100";
  const labelClasses = "block text-sm font-medium text-gray-700 mb-1";
  const buttonClasses = "py-2 px-4 rounded-md text-sm font-medium transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <div className="fixed inset-0 z-[70] bg-black bg-opacity-50 flex justify-center items-center p-4 animate-fade-in-fast">
      <div className="bg-gradient-to-br from-white via-slate-50 to-slate-100 rounded-lg shadow-xl p-6 w-full max-w-md space-y-4 border border-slate-200/50 relative">
        <button
          onClick={onClose}
          disabled={isUpdating}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-slate-200/50 disabled:opacity-50"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-lg font-semibold text-slate-700">Edit Chapter</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="editChapterNumber" className={labelClasses}>Chapter Number*</label>
            <input
              type="number"
              id="editChapterNumber"
              value={chapterNumber}
              onChange={(e) => setChapterNumber(e.target.value === '' ? '' : parseInt(e.target.value))}
              required
              min="1"
              className={inputClasses}
              disabled={isUpdating}
              placeholder="e.g., 1"
            />
          </div>
          <div>
            <label htmlFor="editChapterTitle" className={labelClasses}>Title (Optional)</label>
            <input
              type="text"
              id="editChapterTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClasses}
              disabled={isUpdating}
              placeholder="e.g., The Discovery"
            />
          </div>
          <div>
            <label htmlFor="editChapterSynopsis" className={labelClasses}>Synopsis (Optional)</label>
            <textarea
              id="editChapterSynopsis"
              rows={3}
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              className={inputClasses}
              disabled={isUpdating}
              placeholder="Brief summary of the chapter..."
            />
          </div>

          {updateError && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">{updateError}</p>
          )}

          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isUpdating}
              className={`${buttonClasses} bg-white hover:bg-gray-100 text-gray-700 border border-gray-300`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUpdating}
              className={`${buttonClasses} bg-blue-600 hover:bg-blue-700 text-white`}
            >
              {isUpdating ? loadingSpinner : null}
              {isUpdating ? 'Updating...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
      {/* Add fade-in animation style */}
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