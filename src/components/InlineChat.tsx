import { useState, useRef, useEffect, useCallback } from 'react';
import * as Diff from 'diff'; // Keep diff for potential future use, though primary diff is in page
import { parseParagraphs } from '@/lib/textUtils';
// Import types from the central types file
import type { ContextParagraphData, EditProposal } from '@/types/chat';

interface Message {
  id: string;
  text: string; // For user messages or fallback assistant text
  type: 'user' | 'assistant';
  timestamp: Date;
  selections?: string[]; // Text selected with mouse/shortcut
  contextParagraphs?: string[]; // Paragraphs selected via dots
  proposal?: EditProposal | null; // To store the structured proposal from the API
  proposalActioned?: boolean; // Flag to hide buttons after action
}

interface InlineChatProps {
  currentStory: string | null; // The story content being discussed/refined
  currentGenerationId: string | null; // ID of the current generation being discussed
  // Callbacks to parent (page.tsx)
  onAcceptProposal: (proposal: EditProposal) => void; // User clicked "Accept" on a specific proposal
  onRejectProposal: (messageId: string) => void; // User clicked "Reject" on a specific proposal
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
  onAcceptProposal,
  onRejectProposal,
  onReceiveProposal,
  onNewChat,
  storyContext,
  className = '',
  // Destructure new props & add default value
  selectedContextData = [], // Default to empty array
  storyForContext,
  onClearContextSelection,
}: InlineChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedTextInsideChat, setSelectedTextInsideChat] = useState('');
  const [pendingSelections, setPendingSelections] = useState<string[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false); // Loading state for API calls
  const [chatError, setChatError] = useState<string | null>(null); // Error state for API calls
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Clear chat when the story/generation context changes significantly (e.g., new part generated or accepted)
  useEffect(() => {
    setMessages([]);
    setPendingSelections([]);
    setInputText('');
    setChatError(null);
    setIsChatLoading(false);
  }, [currentGenerationId]);


  // --- Selection Handling ---
  const handleTextSelectionInsideChat = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      setSelectedTextInsideChat(selection.toString().trim());
    } else {
      setSelectedTextInsideChat('');
    }
  };

  const handleAddSelectionFromChat = () => {
    if (selectedTextInsideChat) {
      setPendingSelections(prev => [...prev, selectedTextInsideChat]);
      setSelectedTextInsideChat('');
    }
  };

  const addGlobalSelection = useCallback((text: string) => {
    if (text) {
      setPendingSelections(prev => [...prev, text]);
      console.log("Selection added:", text);
    }
  }, []);

  // --- Global Shortcut Listener ---
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      if (!event.key) return;
      const shortcutPressed = event.key.toLowerCase() === 'a' && event.ctrlKey && (
        (isMac && event.metaKey) || (!isMac && event.altKey)
      );
      if (shortcutPressed) {
        event.preventDefault();
        const selection = window.getSelection();
        const selectedText = selection ? selection.toString().trim() : '';
        if (selectedText) {
          addGlobalSelection(selectedText);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [addGlobalSelection]);

  // Button handler to add current global selection
  const handleAddGlobalSelectionClick = () => {
      const selection = window.getSelection();
      const selectedText = selection ? selection.toString().trim() : '';
      if (selectedText) {
          addGlobalSelection(selectedText);
      } else {
          console.log("No text selected on the page.");
      }
  };

  // --- Message Sending ---
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const userRequestText = inputText.trim();
    const hasPendingTextSelection = pendingSelections.length > 0;
    const hasPendingParagraphSelection = selectedContextData.length > 0;

    // Require story context AND either text input OR some selection
    if (!currentStory || (!userRequestText && !hasPendingTextSelection && !hasPendingParagraphSelection) || isChatLoading) {
        setChatError("Cannot send message: No story context, input, or selections provided.");
        return;
    }

    setIsChatLoading(true);
    setChatError(null);

    // --- Prepare Context Paragraphs ---
    let contextParagraphsContent: string[] = [];
    if (hasPendingParagraphSelection && storyForContext) {
        try {
            const allParagraphs = parseParagraphs(storyForContext);
            contextParagraphsContent = selectedContextData
                .sort((a, b) => a.index - b.index) // Ensure order
                .map(data => allParagraphs[data.index])
                .filter(p => p !== undefined); // Filter out potential invalid indices
        } catch (error) {
            console.error("Error extracting context paragraphs:", error);
            setChatError("Failed to extract selected paragraphs for context.");
            // Optional: Decide whether to proceed without paragraph context or stop
        }
    }
    // --- End Prepare Context Paragraphs ---

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      text: userRequestText || (hasPendingParagraphSelection ? "Paragraph context added" : "Selection(s) added"),
      type: 'user',
      timestamp: new Date(),
      selections: [...pendingSelections], // Add regular selections
      contextParagraphs: contextParagraphsContent, // Add paragraph context
    };
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    const currentSelections = [...pendingSelections]; // Capture text selections for API
    setPendingSelections([]); // Clear pending text selections
    // Clear paragraph selections via callback *after* preparing message
    if (hasPendingParagraphSelection) {
        onClearContextSelection();
    }

    const apiHistory = messages.map(msg => ({
        role: msg.type === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.proposal?.explanation || msg.text }]
    }));

    // --- Prepare API Payload ---
    const apiPayload = {
        messages: apiHistory,
        currentStory: currentStory,
        userRequest: userRequestText,
        selections: currentSelections,
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

        // Notify parent about the received proposal (for diffing, etc.)
        // Do this BEFORE adding the message to local state? Or after? Let's do it before.
        onReceiveProposal(proposalResult);

        const assistantMessage: Message = {
            id: `asst-${Date.now()}`,
            text: proposalResult.explanation, // Display the explanation
            type: 'assistant',
            timestamp: new Date(),
            proposal: proposalResult, // Store the structured proposal
            proposalActioned: false,
        };
        setMessages(prev => [...prev, assistantMessage]);

    } catch (err: any) {
        console.error('InlineChat API request failed:', err);
        setChatError(err.message || 'Failed to get response from assistant.');
        const errorMessage: Message = {
            id: `err-${Date.now()}`,
            text: `Error: ${err.message || 'Failed to get response from assistant.'}`,
            type: 'assistant',
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMessage]);
    } finally {
        setIsChatLoading(false);
    }
  };

  // --- Handlers for Accept/Reject within Chat ---
  const handleAcceptEdit = (messageId: string, proposal: EditProposal) => {
    onAcceptProposal(proposal); // Call parent function to apply the change to the main story state
    setMessages(prev => prev.map(msg =>
      msg.id === messageId ? { ...msg, proposalActioned: true } : msg
    ));
  };

  const handleRejectEdit = (messageId: string) => {
     onRejectProposal(messageId); // Call parent function (e.g., to clear diff highlights)
     setMessages(prev => prev.map(msg =>
       msg.id === messageId ? { ...msg, proposalActioned: true, text: `Suggestion declined: ${msg.text}` } : msg
     ));
  };

  // --- Handler for starting a new chat thread ---
  const handleStartNewChat = () => {
    setMessages([]);
    setPendingSelections([]);
    setInputText('');
    setChatError(null);
    setIsChatLoading(false);
    onNewChat(); // Notify parent (e.g., clear diffs)
  }

  return (
    <div className={`mt-4 border border-slate-200/80 rounded-lg shadow-inner bg-slate-50/50 ${className}`}>
      {/* Chat History Area */}
      <div className="max-h-60 overflow-y-auto p-3 space-y-3 border-b border-slate-200/60">
          {messages.length === 0 && !isChatLoading && !chatError && (
             <p className="text-sm text-gray-500 italic text-center py-2">Ask for edits or refinements here...</p>
          )}
         {messages.map(message => (
          <div
            key={message.id}
            className={`p-2 rounded-lg text-sm max-w-[85%] ${
              message.type === 'user'
                ? 'bg-blue-50 border border-blue-100 ml-auto'
                : 'bg-gray-100 border border-gray-200 mr-auto'
            }`}
          >
            {/* Display user text selections */}
            {message.type === 'user' && message.selections && message.selections.length > 0 && (
             <div className="mb-1 border-b border-dashed border-yellow-300 pb-1">
               <span className="text-xs font-semibold text-yellow-700 block">Selections:</span>
               {message.selections.map((selection, index) => (
                 <div key={index} className="text-xs bg-yellow-100 p-1 mt-1 rounded border border-yellow-200 break-words">
                   "{selection}"
                 </div>
               ))}
             </div>
            )}
            {/* Display user paragraph context selections */}
            {message.type === 'user' && message.contextParagraphs && message.contextParagraphs.length > 0 && (
             <div className="mb-1 border-b border-dashed border-blue-300 pb-1 mt-1">
               <span className="text-xs font-semibold text-blue-700 block">Context Paragraphs:</span>
               {message.contextParagraphs.map((paragraph, index) => (
                 <div key={index} className="text-xs bg-blue-100 p-1 mt-1 rounded border border-blue-200 break-words">
                   "{paragraph}"
                 </div>
               ))}
             </div>
            )}

            {/* Display message text */}
            <p className="text-gray-800 whitespace-pre-wrap break-words">{message.text}</p>

            {/* Display Assistant Edit Proposal Actions */}
            {message.type === 'assistant' && message.proposal && !message.proposalActioned &&
             (message.proposal.type === 'replace' || message.proposal.type === 'insert' || message.proposal.type === 'delete') && (
              <div className="mt-2 pt-2 border-t border-gray-200 flex justify-end space-x-2">
                <button
                  onClick={() => handleRejectEdit(message.id)}
                  className="px-2 py-1 text-xs bg-red-100 text-red-700 border border-red-300 rounded hover:bg-red-200 transition-colors"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleAcceptEdit(message.id, message.proposal!)}
                  className="px-2 py-1 text-xs bg-green-100 text-green-700 border border-green-300 rounded hover:bg-green-200 transition-colors"
                >
                  Accept Edit
                </button>
              </div>
            )}
            {message.proposalActioned && (
                <div className="mt-1 text-xs text-gray-400 italic">Suggestion actioned.</div>
            )}

            <div className="text-xs text-gray-400 mt-1 text-right">
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
         ))}
          {isChatLoading && (
              <div className="p-2 text-center text-xs text-gray-500">Assistant is thinking...</div>
          )}
          {chatError && (
               <div className="p-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg mt-2">
                  <span className="font-semibold">Error:</span> {chatError}
               </div>
          )}
          {/* Pending selections display */}
          {pendingSelections.length > 0 && (
            <div className="p-2 text-xs text-gray-600 bg-yellow-50 border border-yellow-200 rounded-lg sticky bottom-0 shadow-sm">
              <span className="font-semibold">Pending Selections ({pendingSelections.length}):</span>
              <ul className="list-disc list-inside ml-2 max-h-20 overflow-y-auto">
                {pendingSelections.map((sel, i) => <li key={i} className="truncate">"{sel}"</li>)}
              </ul>
               <button
                    onClick={() => setPendingSelections([])}
                    className="text-xs text-gray-500 hover:text-red-600 float-right -mt-4 mr-1"
                    title="Clear selections"
                >
                    &times;
                </button>
            </div>
          )}
          <div ref={messagesEndRef} />
      </div>

      {/* Selection Adder within Chat Area */}
       {selectedTextInsideChat && (
            <div className="p-2 border-b border-gray-200/70 bg-gray-50">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-600 truncate flex-1 mr-2">
                  Selected in chat: "{selectedTextInsideChat}"
                </p>
                <button
                  onClick={handleAddSelectionFromChat}
                  className="px-2 py-1 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600 transition-colors"
                >
                  Add Selection
                </button>
              </div>
            </div>
       )}

      {/* Input Area */}
      <form onSubmit={handleSendMessage} className="p-3">
        <div className="flex items-center space-x-2">
          <button
              type="button"
              onClick={handleAddGlobalSelectionClick}
              title="Add selected text from page (Shortcut: Cmd+Ctrl+A or Ctrl+Alt+A)"
              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-md transition-colors border border-gray-300/70"
          >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
          </button>
           <button
              type="button"
              onClick={handleStartNewChat}
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-md transition-colors border border-gray-300/70"
              title="Start New Chat Thread"
            >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
             </svg>
            </button>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={currentStory ? "Ask for changes or refinements..." : "Generate a story first..."}
            className="flex-1 p-2 text-sm border border-gray-300/70 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
            disabled={isChatLoading || !currentStory}
          />
          <button
            type="submit"
            // Update disabled condition slightly to account for paragraph selections
            disabled={(!inputText.trim() && pendingSelections.length === 0 && selectedContextData.length === 0) || isChatLoading || !currentStory}
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