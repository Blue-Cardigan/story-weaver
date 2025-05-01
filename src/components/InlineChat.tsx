import { useState, useRef, useEffect, useCallback } from 'react';
import * as Diff from 'diff'; // Keep diff for potential future use, though primary diff is in page
import { parseParagraphs } from '@/lib/textUtils';
// Import types from the central types file
import type { ContextParagraphData, EditProposal } from '@/types/chat';

interface Message { // Keep Message type temporarily if needed for API history construction
  id: string;
  text: string; // For user messages or fallback assistant text
  type: 'user' | 'assistant';
  timestamp: Date;
  selections?: string[]; // Text selected with mouse/shortcut
  contextParagraphs?: string[]; // Paragraphs selected via dots
  proposal?: EditProposal | null; // To store the structured proposal from the API
  // proposalActioned?: boolean; // No longer needed here
}

interface InlineChatProps {
  currentStory: string | null; // The story content being discussed/refined
  currentGenerationId: string | null; // ID of the current generation being discussed
  // Callbacks to parent (page.tsx)
  // REMOVED: onAcceptProposal: (proposal: EditProposal) => void; // User clicked "Accept" on a specific proposal
  // REMOVED: onRejectProposal: (messageId: string) => void; // User clicked "Reject" on a specific proposal
  onReceiveProposal: (proposal: EditProposal) => void; // API returned a proposal, notify parent to show diff etc.
  onNewChat: () => void; // User requested to clear the chat history
  storyContext?: { // Optional context for the API
    storyId?: string;
    chapterId?: string;
    effectiveIdentifier?: string;
  };
  className?: string;
  // Prop type already matches the data from EditableText
  selectedContextData: ContextParagraphData[];
  storyForContext: string | null;
  onClearContextSelection: () => void;
}

export default function InlineChat({
  currentStory,
  currentGenerationId,
  // REMOVED: onAcceptProposal,
  // REMOVED: onRejectProposal,
  onReceiveProposal,
  onNewChat,
  storyContext,
  className = '',
  // Destructure new props & add default value
  selectedContextData = [], // Default to empty array
  storyForContext,
  onClearContextSelection,
}: InlineChatProps) {
  // Remove state related to displaying messages
  // const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  // Remove internal chat selection state
  // const [selectedTextInsideChat, setSelectedTextInsideChat] = useState('');
  // const [pendingSelections, setPendingSelections] = useState<string[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false); // Loading state for API calls
  const [chatError, setChatError] = useState<string | null>(null); // Error state for API calls
  // Remove messagesEndRef
  // const messagesEndRef = useRef<HTMLDivElement>(null);

  // Remove effects related to messages
  // useEffect(() => {
  //   messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  // }, [messages]);

  useEffect(() => {
    // Clear input and error state on generation change, but not messages (as they don't exist)
    // setMessages([]);
    // setPendingSelections([]);
    setInputText('');
    setChatError(null);
    setIsChatLoading(false);
  }, [currentGenerationId]);

  // Remove internal chat selection handlers
  // const handleTextSelectionInsideChat = () => { ... };
  // const handleAddSelectionFromChat = () => { ... };

  // --- Message Sending --- (Keep core logic, but don't add to local message state)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const userRequestText = inputText.trim();
    // Remove pendingSelections usage
    // const hasPendingTextSelection = pendingSelections.length > 0;
    const hasPendingParagraphSelection = selectedContextData.length > 0;

    // Require story context AND either text input OR paragraph selection
    if (!currentStory || (!userRequestText && !hasPendingParagraphSelection) || isChatLoading) {
        setChatError("Cannot send message: No story context, input, or paragraph selections provided.");
        return;
    }

    setIsChatLoading(true);
    setChatError(null);

    // --- Prepare Context Paragraphs --- (Keep this)
    let contextParagraphsContent: string[] = [];
    if (hasPendingParagraphSelection && storyForContext) {
        try {
            // Need parseParagraphs or similar logic here if we still want to display paragraph text in API request?
            // For now, just pass the selectedContextData indices
            // We might not need the text here if API only needs indices + full story
            // Let's assume API uses the full story + selectedContextData.indices for now
             contextParagraphsContent = selectedContextData
                .sort((a, b) => a.index - b.index) // Ensure order
                .map(data => data.text) // Map to text for history/debugging? Or omit?
                .filter(p => p !== undefined);
        } catch (error) {
            console.error("Error extracting context paragraphs:", error);
            setChatError("Failed to extract selected paragraphs for context.");
        }
    }
    // --- End Prepare Context Paragraphs ---

    // Don't create user message for local state
    // const userMessage: Message = { ... };
    // setMessages(prev => [...prev, userMessage]);
    setInputText('');
    // Remove pendingSelections usage
    // const currentSelections = [...pendingSelections];
    // setPendingSelections([]);
    // Clear paragraph selections via callback *after* preparing payload
    if (hasPendingParagraphSelection) {
        onClearContextSelection();
    }

    // Construct history - Ensure this is always empty for single-turn
    // const apiHistory = messages.map(msg => ({ ... }));
    const apiHistory: any[] = []; // Ensure this remains empty or is removed if payload structure allows

    // --- Prepare API Payload --- (Simplify)
    const apiPayload = {
        messages: [], // Add empty messages array to satisfy API validation
        currentStory: currentStory,
        userRequest: userRequestText,
        // selections: currentSelections, // Omit simple selections for now
        contextParagraphData: selectedContextData, // Pass the full data including indices
        currentGenerationId: currentGenerationId,
        ...(storyContext && { storyContext }),
    };
    // --- End Prepare API Payload ---

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiPayload), // Send the prepared payload
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
            throw new Error(errorData.error || `API request failed with status ${response.status}`);
        }

        const proposalResult: EditProposal = await response.json();

        // Directly call onReceiveProposal instead of adding to local state
        onReceiveProposal(proposalResult);

        // Don't create assistant message for local state
        // const assistantMessage: Message = { ... };
        // setMessages(prev => [...prev, assistantMessage]);

    } catch (err: any) {
        console.error('InlineChat API request failed:', err);
        setChatError(err.message || 'Failed to get response from assistant.');
        // Don't add error message to local state
        // const errorMessage: Message = { ... };
        // setMessages(prev => [...prev, errorMessage]);
        // Maybe notify parent of error?
        // For now, just show error below input.
    } finally {
        setIsChatLoading(false);
    }
  };

  // Remove handlers for Accept/Reject within Chat
  // const handleAcceptEdit = (messageId: string, proposal: EditProposal) => { ... };
  // const handleRejectEdit = (messageId: string) => { ... };

  // --- Handler for starting a new chat thread --- (Simplify)
  const handleStartNewChat = () => {
    // setMessages([]);
    // setPendingSelections([]);
    setInputText('');
    setChatError(null);
    setIsChatLoading(false);
    onNewChat(); // Notify parent (e.g., clear diffs)
    onClearContextSelection(); // Clear paragraph selections
  }

  return (
    // Adjust container styling as needed, remove border/background if desired
    <div className={`mt-4 ${className}`}> 
      {/* REMOVE Chat History Area */}
      {/* <div className="max-h-60 overflow-y-auto p-3 space-y-3 border-b border-slate-200/60"> ... </div> */}
      
      {/* REMOVE Selection Adder within Chat Area */}
      {/* {selectedTextInsideChat && ( ... )} */}

      {/* Keep Input Area */} 
      <form onSubmit={handleSendMessage} className="p-3">
         {chatError && (
               <div className="mb-2 p-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg">
                  <span className="font-semibold">Error:</span> {chatError}
               </div>
          )}
        <div className="flex items-center space-x-2">
           <button
              type="button"
              onClick={handleStartNewChat}
              className="flex items-center space-x-1.5 px-2 py-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-md transition-colors border border-gray-300/70 text-xs"
              title="Clear Request, Diff & Selections"
            >
              {/* Replace icon? Maybe refresh/clear? */}
             <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /> {/* Close/Clear Icon */}
             </svg>
             {/* Conditionally display selection count */}
             {selectedContextData.length > 0 && (
                 <span className="font-medium bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                     {selectedContextData.length}
                 </span>
             )}
            </button>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={currentStory ? "Request an edit..." : "Generate a story first..."}
            className="flex-1 p-2 text-sm border border-gray-300/70 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
            disabled={isChatLoading || !currentStory}
          />
          <button
            type="submit"
            // Update disabled condition (no pendingSelections)
            disabled={(!inputText.trim() && selectedContextData.length === 0) || isChatLoading || !currentStory}
            className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isChatLoading ? (
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
            )}
          </button>
        </div>
      </form>
    </div>
  );
} 