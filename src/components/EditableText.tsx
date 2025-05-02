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
// Import the Markdown extension
import { Markdown } from 'tiptap-markdown';
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
  // Add props for handling accept/reject actions
  handleAcceptProposal?: (proposal: EditProposal) => void;
  handleRejectProposal?: () => void;
  // Add trigger prop to clear selections externally
  clearSelectionsTrigger?: number | undefined;
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
  // Destructure new props
  handleAcceptProposal,
  handleRejectProposal,
  // Destructure trigger prop
  clearSelectionsTrigger,
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
                  // Trim text and calculate adjusted indices
                  const trimmedText = text.trim();
                  const leadingWhitespace = text.length - text.trimStart().length;
                  // const trailingWhitespace = text.length - text.trimEnd().length; // Not needed for end index calc

                  // Adjusted start index: Tiptap node start pos + 1 (for node itself) + leading whitespace
                  const startIndex = pos + 1 + leadingWhitespace;
                  // Adjusted end index: Adjusted start index + length of the *trimmed* text
                  const endIndex = startIndex + trimmedText.length;

                  // Push data with trimmed text and adjusted indices
                  selectedData.push({
                      index: paragraphIndex,
                      text: trimmedText, // Use the trimmed text
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
      Placeholder.configure({ placeholder }),
      ParagraphSelector.configure({ onSelectionStorageChange: handleSelectionStorageChange }),
      // Add the Markdown extension to parse initial content and handle paste
      Markdown.configure({
        html: true, // Allow HTML tags in source string
        tightLists: true, // No <p> inside <li> in markdown output
        linkify: true, // Autoconvert URL-like text to links
        breaks: false, // Convert newlines (\n) to <br> tags
        transformPastedText: true, // Parse markdown pasted into the editor
        transformCopiedText: true, // Convert copied text to markdown
      }),
    ],
    content: value,
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

      // Compare incoming value with current markdown representation
      // Note: getMarkdown() might not be available if the extension isn't fully loaded initially?
      // Comparing HTML might be safer if initial load timing is tricky.
      // For now, assume getMarkdown is available.
      const currentMarkdown = currentEditor.storage.markdown?.getMarkdown() ?? '';

      if (value !== currentMarkdown) {
         // Set content using the raw markdown value
         // The Markdown extension's parse logic handles conversion.
         // Use `false` for emitUpdate to prevent loop with onUpdate -> onChange
         currentEditor.commands.setContent(value, false);
      }
    }
  }, [value]); // Dependency: only the external value prop

  // Effect to clear selections when the trigger prop changes
  useEffect(() => {
      // Only run if the trigger is defined and the editor exists
      if (clearSelectionsTrigger !== undefined && editor && !editor.isDestroyed) {
          console.log("EditableText: Clearing paragraph selections due to trigger.");
          // Call the custom command added to the ParagraphSelector extension
          editor.commands.clearParagraphSelection();
      }
  }, [clearSelectionsTrigger, editor]); // Dependencies: trigger and editor instance

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
  if (proposalForDiff && diffStartIndex !== null && diffEndIndex !== null && handleAcceptProposal && handleRejectProposal) {
    // Extract original and proposed text based on proposal type
    let originalSegment = '';
    const proposedText = proposalForDiff.text ?? '';

    if (proposalForDiff.type === 'replace_all') {
        originalSegment = value; // Original is the entire current value
        // proposedText is already set correctly
    } else if (proposalForDiff.type === 'replace' || proposalForDiff.type === 'delete') {
        originalSegment = value.substring(diffStartIndex, diffEndIndex);
        // proposedText is correct for replace, will be empty for delete (as text is undefined)
    } else if (proposalForDiff.type === 'insert') {
        originalSegment = ''; // Nothing is being replaced
        // proposedText is the text to insert
    }

    // Determine if the proposal type is actionable (should show buttons)
    const isActionableProposal = ['replace', 'insert', 'delete', 'replace_all'].includes(proposalForDiff.type);

    return (
      <div className={`${className} relative`}> {/* Add relative positioning */} 
        {/* Diff View Container */}
        <div
          className="w-full p-3 border border-amber-300 rounded-md bg-amber-50/40 font-serif text-gray-800 leading-relaxed min-h-[200px] whitespace-pre-wrap break-words prose prose-sm max-w-none"
          aria-label="Proposed change preview"
        >
          {/* Text Before Change */}
          {value.substring(0, diffStartIndex)}

          {/* Show Diff */}
          <div className="my-2 p-2 border border-dashed border-gray-300 rounded-md bg-white/50 inline-block">
              {/* Deleted Text (strikethrough red) - only if not insert/replace_all */}
              {originalSegment && proposalForDiff.type !== 'insert' && proposalForDiff.type !== 'replace_all' && (
                  <del className="text-red-600 bg-red-100 px-1 rounded mx-0.5">
                      {originalSegment}
                  </del>
              )}
                {/* Inserted Text (bold green) - only if not delete */}
                {proposedText && proposalForDiff.type !== 'delete' && (
                  <ins className="text-green-700 bg-green-100 px-1 rounded mx-0.5 no-underline font-semibold">
                      {proposedText}
                  </ins>
              )}
          </div>

          {/* Text After Change */}
          {value.substring(diffEndIndex ?? diffStartIndex) /* Use startIndex if endIndex is null (e.g., for insert) */}
        </div>

        {/* Accept/Reject Buttons (only if proposal is actionable) */}
        {isActionableProposal && (
            <div className="absolute bottom-2 right-2 z-10 bg-white/80 backdrop-blur-sm p-1 rounded-md shadow-md border border-gray-200 flex space-x-2">
                 <button
                    onClick={() => handleRejectProposal()} // Call reject handler
                    className="px-2 py-1 text-xs bg-red-100 text-red-700 border border-red-300 rounded hover:bg-red-200 transition-colors"
                    title="Reject this suggestion"
                 >
                     Reject
                 </button>
                 <button
                    onClick={() => handleAcceptProposal(proposalForDiff)} // Pass the proposal to accept handler
                    className="px-2 py-1 text-xs bg-green-100 text-green-700 border border-green-300 rounded hover:bg-green-200 transition-colors"
                    title="Accept this suggestion"
                 >
                    {proposalForDiff.type === 'replace_all' ? 'Accept Full Text' : 'Accept Edit'}
                </button>
            </div>
        )}
      </div>
    );
  }

  // --- Default Editor View (No Diff) ---

  // Toolbar (only show if editor has focus or selection)
  const showActualToolbar = editor?.isFocused || showToolbar;

  return (
    <div className={`${className} relative`}> {/* Add relative positioning */} 
      {editor && showActualToolbar && <TextToolbar onFormat={handleFormat} />}
      <EditorContent editor={editor} />
    </div>
  );
} 