import { useState, useRef, useEffect, useCallback } from 'react';
// Remove old imports no longer needed
// import * as Diff from 'diff';
// import { parseParagraphs } from '@/lib/textUtils';

// Import TipTap
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { Node } from '@tiptap/pm/model'; // Import Node type
// Import the custom extension
import { ParagraphSelector } from './tiptap/ParagraphSelector';
// PluginKey not directly needed here anymore
// import { PluginKey } from '@tiptap/pm/state';
// const paragraphSelectorPluginKey = new PluginKey('paragraphSelector');

import TextToolbar from './TextToolbar';
// Import types from the central types file
import type { ContextParagraphData, EditProposal } from '@/types/chat';

// Helper function to convert simple markdown paragraphs to HTML
const markdownToHtmlParagraphs = (markdown: string): string => {
  if (!markdown) return '';
  // 1. Split by double (or more) newlines, potentially with whitespace between them.
  // 2. Trim each resulting line.
  // 3. Filter out any empty lines that might result.
  // 4. Wrap each line in <p> tags.
  // 5. Join them back into a single HTML string.
  return markdown
    .split(/\n\s*\n/) // Split by one or more newlines
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => `<p>${p}</p>`) // Wrap in paragraph tags
    .join(''); // Join without extra characters
};

interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  proposalForDiff?: EditProposal | null;
  diffStartIndex?: number | null;
  diffEndIndex?: number | null;
  onContextSelectionChange?: (selectedData: ContextParagraphData[]) => void;
}

export default function EditableText({
  value,
  onChange,
  placeholder = 'Click to edit...', // Placeholder needs to be handled by TipTap now
  className = '',
  proposalForDiff = null,
  diffStartIndex = null,
  diffEndIndex = null,
  onContextSelectionChange,
}: EditableTextProps) {
  // Keep toolbar state for now, might need adjustment
  const [showToolbar, setShowToolbar] = useState(false);
  // REMOVED: React state for selected paragraphs - TipTap storage is the source of truth
  // const [selectedParagraphIndices, setSelectedParagraphIndices] = useState<Set<number>>(new Set());
  const isInternalUpdate = useRef(false); // Ref to track internal updates
  // Remove old refs and state
  // const editorRef = useRef<HTMLDivElement>(null);
  // const containerRef = useRef<HTMLDivElement>(null);
  // const [internalValue, setInternalValue] = useState(value);
  // const [isDragging, setIsDragging] = useState(false);
  // const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  // const dragTargetRef = useRef<HTMLDivElement | null>(null); // Ref to track the initial drag target

  // Preprocess initial content
  const initialHtmlContent = markdownToHtmlParagraphs(value);

  // Define editor variable with explicit type first (initially null)
  // We use useRef to hold the editor instance across renders without causing re-renders itself.
  // Although useEditor hook manages its own lifecycle, accessing it within useCallback
  // can be tricky if the callback is defined before the hook.
  // An alternative is defining the callback inside useEffect, but let's stick to useCallback.
  // We'll ensure the callback uses the current editor instance.
  const editorRef = useRef<Editor | null>(null);

  // Callback function to handle selection changes notified by the ParagraphSelector plugin
  // Define this *before* useEditor, but ensure it uses the *current* editor instance via editorRef
  const handleSelectionStorageChange = useCallback((indices: Set<number>) => {
    const currentEditor = editorRef.current;
      if (!currentEditor || currentEditor.isDestroyed || !onContextSelectionChange) {
          return;
      }

      // Calculate context data based on the indices provided by the plugin
      const selectedData: ContextParagraphData[] = [];
      let paragraphIndex = 0;

      currentEditor.state.doc.forEach((node: Node, pos: number) => { // Add types here
          if (node.type.name === 'paragraph') {
              if (indices.has(paragraphIndex)) {
                  const text = node.textContent;
                  const startIndex = pos + 1;
                  const endIndex = startIndex + text.length;
                  selectedData.push({
                      index: paragraphIndex,
                      text: text,
                      startIndex: startIndex,
                      endIndex: endIndex,
                  });
              }
              paragraphIndex++;
          }
      });
      // Call the parent component's callback
      onContextSelectionChange(selectedData);

  }, [onContextSelectionChange]); // Dependency: only the callback prop itself

  // Tiptap editor instance using the useEditor hook
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({
        placeholder: placeholder,
      }),
      ParagraphSelector.configure({
        onSelectionStorageChange: handleSelectionStorageChange,
      }),
    ],
    content: initialHtmlContent,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      isInternalUpdate.current = true;
      onChange(editor.getHTML());
    },
    onSelectionUpdate: ({ editor }) => {
      setShowToolbar(editor.state.selection.content().size > 0);
    },
    editorProps: {
      attributes: {
        class: 'w-full p-3 border border-gray-300/70 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/90 font-serif text-gray-800 leading-relaxed min-h-[200px] box-border prose prose-sm max-w-none relative',
        role: 'textbox',
      },
    },
    // Lifecycle hook to update our ref when the editor is created
    onCreate: ({ editor }) => {
        editorRef.current = editor;
    },
    // Lifecycle hook to clear our ref when the editor is destroyed
    onDestroy: () => {
        editorRef.current = null;
    },
  });

  // Update editorRef if the editor instance from useEditor changes (e.g., on re-init)
  // Although useEditor typically handles this, explicit sync can be safer.
  useEffect(() => {
      editorRef.current = editor;
      // Ensure the initial state of the callback reference is correct if editor initializes later
      // This might be redundant if onCreate handles it reliably.
      if (editor && !editor.isDestroyed) {
          // Maybe recalculate initial selection data if needed?
          // const initialIndices = editor.storage.paragraphSelector?.selectedIndices || new Set();
          // handleSelectionStorageChange(initialIndices); // Careful: might cause loops if not handled well
      }
      return () => {
          // Cleanup ref on component unmount or if editor instance changes
          // editorRef.current = null; // onDestroy handles this
      };
  }, [editor]); // React to changes in the editor instance from useEditor

  // Effect to update editor content if the parent `value` prop changes
  useEffect(() => {
    // Use the ref here to ensure we're acting on the initialized editor
    const currentEditor = editorRef.current;
    if (currentEditor && !currentEditor.isDestroyed) {
      if (isInternalUpdate.current) {
        isInternalUpdate.current = false;
        return;
      }
      const newHtml = markdownToHtmlParagraphs(value);
      const currentHtml = currentEditor.getHTML();
      if (currentHtml !== newHtml) {
         currentEditor.commands.setContent(newHtml, false);
      }
    }
  }, [value]); // Dependency: only the external value prop

  // REMOVED: Effect to sync React state changes for selectedParagraphIndices TO the editor storage
  // useEffect(() => { ... });

  // Remove old paragraph parsing
  // const paragraphs = parseParagraphs(internalValue);

  // Remove old event handlers
  // const handleMouseDown = ...
  // const handleMouseMove = ...
  // const handleMouseUp = ...
  // const handleGlobalMouseUp = ...
  // const handleInput = ...
  // const handleBlur = ...
  // const handleSelectionChange = ...

  // Toolbar formatting needs to use editor commands
  const handleFormat = (format: string) => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;
    const chain = currentEditor.chain().focus();
    switch (format) {
      case 'bold': chain.toggleBold().run(); break;
      case 'italic': chain.toggleItalic().run(); break;
      case 'underline': chain.toggleUnderline().run(); break;
      case 'strikethrough': chain.toggleStrike().run(); break;
      case 'code': chain.toggleCodeBlock().run(); break;
      default: return;
    }
  };

  // Conditional rendering for diff view
  if (proposalForDiff && diffStartIndex !== null && diffEndIndex !== null) {
    // Extract original and proposed text
    const originalText = value.substring(diffStartIndex, diffEndIndex);
    // Get proposed text directly from the proposal object
    const proposedText = proposalForDiff.text ?? ''; // Default to empty string if text is missing

    return (
      // Keep the diff view rendering as it was, it doesn't use the editor
      <div
        className="w-full p-3 border border-amber-300/70 rounded-md bg-amber-50/40 font-serif text-gray-800 leading-relaxed min-h-[200px] whitespace-pre-wrap break-words"
        aria-label="Proposed change preview"
      >
         {/* Text Before Change */}
         {value.substring(0, diffStartIndex)}

         {/* Show Original and Proposed side-by-side or block */}
         <div className="my-2 p-2 border border-dashed border-gray-300 rounded-md bg-white/50">
             <div className="mb-1">
                 <span className="text-xs font-semibold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-sm mr-1">Original:</span>
                 <span className="text-red-800 line-through">{originalText || '[nothing]'}</span>
             </div>
             <div>
                 <span className="text-xs font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-sm mr-1">Proposed:</span>
                 <span className="text-green-800">{proposedText || '[deletion]'}</span>
             </div>
         </div>

         {/* Text After Change */}
         {value.substring(diffEndIndex)}
      </div>
     );
  }

  // Render the TipTap editor
  return (
    // Moved relative positioning from editorProps to here, might be more reliable
    <div className={`relative ${className}`}>
      {showToolbar && editor && (
        <div className="absolute -top-10 right-0 z-10">
          {/* Pass editor instance to toolbar if needed, or keep handleFormat */}
          <TextToolbar onFormat={handleFormat} />
        </div>
      )}
      {/* Render TipTap editor using the instance from useEditor */}
      {/* EditorContent correctly handles null editor instance initially */}
      <EditorContent editor={editor} />
      {/* Placeholder needs Placeholder extension */}
      {/* {editor && editor.isEmpty && <div className="text-gray-400 absolute top-3 left-3 pointer-events-none">{placeholder}</div>} */}

      {/* Paragraph dots are now handled entirely by the ParagraphSelector extension's decorations */}
    </div>
  );
} 