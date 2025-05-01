import { useState, useRef, useEffect, useCallback } from 'react';
import TextToolbar from './TextToolbar';
import * as Diff from 'diff';
import { parseParagraphs } from '@/lib/textUtils';
// Import types from the central types file
import type { ContextParagraphData, EditProposal } from '@/types/chat';

interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  proposalForDiff?: EditProposal | null;
  diffStartIndex?: number | null;
  diffEndIndex?: number | null;
  // Update the callback prop type
  onContextSelectionChange?: (selectedData: ContextParagraphData[]) => void;
}

export default function EditableText({
  value,
  onChange,
  placeholder = 'Click to edit...',
  className = '',
  proposalForDiff = null,
  diffStartIndex = null,
  diffEndIndex = null,
  onContextSelectionChange,
}: EditableTextProps) {
  const [showToolbar, setShowToolbar] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedParagraphIndices, setSelectedParagraphIndices] = useState<Set<number>>(new Set());
  const [internalValue, setInternalValue] = useState(value);
  // State for drag selection
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const dragTargetRef = useRef<HTMLDivElement | null>(null); // Ref to track the initial drag target

  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  useEffect(() => {
    if (onContextSelectionChange) {
      // Recalculate paragraphs here for index calculation
      const currentParagraphs = parseParagraphs(internalValue);
      const selectedData: ContextParagraphData[] = [];
      let currentIndex = 0;
      currentParagraphs.forEach((pText, i) => {
          const startIndex = internalValue.indexOf(pText, currentIndex);
          let endIndex = startIndex + pText.length;

          if (startIndex !== -1) {
              if (selectedParagraphIndices.has(i)) {
                  selectedData.push({
                      index: i,
                      text: pText,
                      startIndex: startIndex,
                      endIndex: endIndex,
                  });
              }
              // Advance index past the current paragraph and the expected newline
              // Be careful with the last paragraph which might not have a trailing newline
              currentIndex = endIndex + 1; // Assumes paragraphs are separated by single \n
          } else {
              // Handle cases where a paragraph might not be found sequentially
              // This could happen with identical paragraphs or if parsing logic differs.
              // For now, log a warning, but a more robust solution might be needed.
              console.warn(`Paragraph index calculation mismatch for paragraph ${i}: "${pText.substring(0, 20)}..."`);
              // Attempt to keep currentIndex somewhat sensible
              currentIndex += pText.length + 1;
          }
      });

      onContextSelectionChange(selectedData);
    }
    // Depend on internalValue as well, since indices depend on it
  }, [selectedParagraphIndices, onContextSelectionChange, internalValue]);

  const paragraphs = parseParagraphs(internalValue);

  const handleMouseDown = (index: number, e: React.MouseEvent<HTMLSpanElement>) => {
    e.preventDefault(); // Prevent text selection during drag
    setIsDragging(true);
    setDragStartIndex(index);
    dragTargetRef.current = e.target as HTMLDivElement; // Track the specific dot clicked
    // Select the first paragraph immediately
    setSelectedParagraphIndices(prevIndices => {
        const newIndices = new Set(prevIndices);
        // Determine toggle behavior based on the initial click
        if (newIndices.has(index)) {
            newIndices.delete(index);
        } else {
            newIndices.add(index);
        }
        return newIndices;
    });
  };

  const handleMouseMove = (index: number) => {
    if (!isDragging || dragStartIndex === null) return;

    setSelectedParagraphIndices(prevIndices => {
        const newIndices = new Set<number>();
        const start = Math.min(dragStartIndex, index);
        const end = Math.max(dragStartIndex, index);
        for (let i = start; i <= end; i++) {
            newIndices.add(i);
        }
        // If the initial drag target was already selected, maybe we are *deselecting*?
        // This logic can get complex. Let's stick to additive selection for now.
        // For more advanced behavior (like toggling based on initial state), more logic is needed.
        return newIndices;
    });
  };

  const handleMouseUp = () => {
    if (isDragging) {
        setIsDragging(false);
        setDragStartIndex(null);
        dragTargetRef.current = null;
        // The selection state is already updated by handleMouseMove
    }
  };

  // Add global mouseup listener to catch mouseup outside the component
  useEffect(() => {
    const handleGlobalMouseUp = () => {
        if (isDragging) {
             handleMouseUp();
        }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
        window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging]); // Re-add listener if isDragging changes

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    let reconstructedValue = '';
    if (target.childNodes) {
        const childNodes = Array.from(target.childNodes);
        reconstructedValue = childNodes.map(node => {
            if (node instanceof HTMLDivElement && node.classList.contains('paragraph-content')) {
                return node.textContent || '';
            }
            return '';
        }).filter(text => text !== null).join('\n');
    }
    setInternalValue(reconstructedValue);
    onChange(reconstructedValue);
  };

  const handleBlur = () => {
    setTimeout(() => setShowToolbar(false), 100);
  };

  const handleSelectionChange = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
          const hasSelection = !selection.isCollapsed;
          setShowToolbar(hasSelection);
      } else {
          setShowToolbar(false);
      }
    } else {
      setShowToolbar(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [handleSelectionChange]);

  const handleFormat = (format: string) => {
    let command = '';
    switch (format) {
      case 'bold': command = 'bold'; break;
      case 'italic': command = 'italic'; break;
      case 'underline': command = 'underline'; break;
      case 'strikethrough': command = 'strikeThrough'; break;
      case 'code': console.warn('Code block formatting not implemented for contentEditable'); return;
      default: return;
    }
    document.execCommand(command, false, undefined);
    if (editorRef.current) {
        editorRef.current.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    }
  };

  const renderContent = () => {
    if (proposalForDiff && diffStartIndex !== null && diffEndIndex !== null) {
        // Extract original and proposed text
        const originalText = value.substring(diffStartIndex, diffEndIndex);
        // Get proposed text directly from the proposal object
        const proposedText = proposalForDiff.text ?? ''; // Default to empty string if text is missing

        return (
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
    } else {
      return (
        <div
          ref={editorRef}
          contentEditable={true}
          suppressContentEditableWarning={true}
          onInput={handleInput}
          onBlur={handleBlur}
          className="w-full p-3 border border-gray-300/70 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/90 font-serif text-gray-800 leading-relaxed min-h-[200px] box-border prose prose-sm max-w-none"
          role="textbox"
          aria-multiline="true"
          aria-placeholder={placeholder}
        >
          {paragraphs.map((p, index) => (
            <div key={index} className="relative paragraph-wrapper pl-4" /* Add padding for dot */ >
              <span
                // onClick={(e) => { ... }} // Remove simple click handler
                onMouseDown={(e) => handleMouseDown(index, e)}
                onMouseMove={() => handleMouseMove(index)}
                // We use a global mouseup listener, but can add one here too for redundancy if needed
                // onMouseUp={handleMouseUp} 
                className={`absolute left-0 top-1.5 w-2 h-2 rounded-full cursor-pointer transition-colors ${ 
                    selectedParagraphIndices.has(index) ? 'bg-blue-500' : 'bg-gray-300 hover:bg-gray-400'
                }`}
                title="Click or drag to select paragraph(s) for context"
              />
              {/* This inner div holds the actual editable text for the paragraph */}
              <div 
                className={`paragraph-content outline-none ${selectedParagraphIndices.has(index) ? 'bg-blue-50' : ''}`} // Added outline-none and selection highlight
              >{p || '\uFEFF'}</div> {/* Use ZWS for empty paragraphs to maintain structure */}
            </div>
          ))}
          {paragraphs.length === 0 && <div className="text-gray-400 absolute top-3 left-3 pointer-events-none">{placeholder}</div>}
        </div>
      );
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {showToolbar && editorRef.current && (
        <div className="absolute -top-10 right-0 z-10">
          <TextToolbar onFormat={handleFormat} />
        </div>
      )}
      {renderContent()}
    </div>
  );
} 