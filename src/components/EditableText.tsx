import { useState, useRef, useEffect } from 'react';
import TextToolbar from './TextToolbar';
import * as Diff from 'diff';

interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  diffToDisplay?: Diff.Change[] | null;
  diffStartIndex?: number | null;
  diffEndIndex?: number | null;
}

export default function EditableText({
  value,
  onChange,
  placeholder = 'Click to edit...',
  className = '',
  diffToDisplay = null,
  diffStartIndex = null,
  diffEndIndex = null,
}: EditableTextProps) {
  const [showToolbar, setShowToolbar] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea to fit content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      // Set the height to scrollHeight to fit the content
      textarea.style.height = `${Math.max(200, textarea.scrollHeight)}px`;
    }
  }, [value]);

  // Also resize on window resize
  useEffect(() => {
    const handleResize = () => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.max(200, textarea.scrollHeight)}px`;
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const handleSelectionChange = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const hasSelection = textarea.selectionStart !== textarea.selectionEnd;
    setShowToolbar(hasSelection);
    
    // If there's a selection, ensure the toolbar is visible
    /* Remove auto-scroll logic
    if (hasSelection) {
      // Scroll the textarea into view if needed
      const selectionEnd = textarea.selectionEnd;
      const textLength = textarea.value.length;
      
      // If selection is in the bottom third of the text, scroll to make it visible
      if (selectionEnd > textLength * 0.7) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    }
    */
  };

  const handleFormat = (format: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);
    let formattedText = '';

    switch (format) {
      case 'bold':
        formattedText = `**${selectedText}**`;
        break;
      case 'italic':
        formattedText = `*${selectedText}*`;
        break;
      case 'underline':
        formattedText = `<u>${selectedText}</u>`;
        break;
      case 'strikethrough':
        formattedText = `~~${selectedText}~~`;
        break;
      case 'code':
        formattedText = '```' + selectedText + '```';
        break;
    }

    const newValue = value.substring(0, start) + formattedText + value.substring(end);
    onChange(newValue);
    
    // Reset selection after formatting
    setTimeout(() => {
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(start, start + formattedText.length);
      }
    }, 0);
  };

  return (
    <div ref={containerRef} className={`relative ${className} overflow-hidden`}>
      {showToolbar && (
        <div className="absolute -top-10 right-0 z-10">
          <TextToolbar onFormat={handleFormat} />
        </div>
      )}

      {/* Conditionally render based on diffToDisplay and valid indices */}
      {diffToDisplay && diffStartIndex !== null && diffEndIndex !== null ? (
        // Render non-editable diff view including context
        <div 
          className="w-full p-3 border border-gray-300/70 rounded-md bg-gray-50/50 font-serif text-gray-800 leading-relaxed min-h-[200px] whitespace-pre-wrap break-words"
          aria-label="Proposed change preview"
        >
           {/* Text Before Change */}
           {value.substring(0, diffStartIndex)}
           {/* The Changed Segment (Inline Diff) */}
           {diffToDisplay.map((part, index) => (
            <span
              key={index}
              className={`
                ${part.added ? 'bg-green-100 text-green-800 px-0.5 mx-px rounded' : ''}
                ${part.removed ? 'bg-red-100 text-red-800 line-through px-0.5 mx-px rounded' : ''}
              `}
            >
              {part.value}
            </span>
          ))}
           {/* Text After Change */}
           {value.substring(diffEndIndex)}
        </div>
      ) : (
        // Render editable textarea
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onSelect={handleSelectionChange}
          placeholder={placeholder}
          className="w-full p-3 border border-gray-300/70 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/90 font-serif text-gray-800 leading-relaxed min-h-[200px] box-border overflow-y-hidden"
          rows={1}
        />
      )}
    </div>
  );
} 