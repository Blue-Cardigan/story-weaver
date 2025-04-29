import { useState, useRef, useEffect, useCallback } from 'react';
import * as Diff from 'diff'; // Import the diff library

// Define the structure we expect the AI to return for edits
// (Mirroring the definition in api/chat/route.ts)
interface EditProposal {
  type: 'replace' | 'insert' | 'delete' | 'clarification' | 'none';
  explanation: string;
  startIndex?: number;
  endIndex?: number;
  text?: string;
}

interface Message {
  id: string;
  text: string; // For user messages or fallback assistant text
  type: 'user' | 'assistant';
  timestamp: Date;
  selections?: string[];
  proposal?: EditProposal | null; // To store the structured proposal from the API
  proposalActioned?: boolean; // Flag to hide buttons after action
}

interface ChatProps {
  // Remove onRequestChange
  // Add props to pass story context and handle applying edits
  currentStory: string | null;
  // Rename onApplyEdit to onAcceptProposal
  onAcceptProposal: (proposal: EditProposal) => void;
  // Add onRejectProposal
  onRejectProposal: (messageId: string) => void;
  // Add onReceiveProposal
  onReceiveProposal: (proposal: EditProposal) => void;
  onNewChat: () => void; // Add prop for starting a new chat
  className?: string;
  isCollapsed: boolean;
  setIsCollapsed: (isCollapsed: boolean) => void;
}

// Destructure new props, remove old ones
export default function Chat({
  currentStory,
  onAcceptProposal,
  onRejectProposal,
  onReceiveProposal,
  onNewChat, // Destructure new prop
  className = '',
  isCollapsed,
  setIsCollapsed
}: ChatProps) {
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

  // --- Selection Handling ---

  // Capture selection *within* the chat area
  const handleTextSelectionInsideChat = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      setSelectedTextInsideChat(selection.toString().trim());
    } else {
      setSelectedTextInsideChat(''); // Clear if selection is empty
    }
  };

  // Add selected text (from within chat) to pending selections
  const handleAddSelectionFromChat = () => {
    if (selectedTextInsideChat) {
      setPendingSelections(prev => [...prev, selectedTextInsideChat]);
      setSelectedTextInsideChat(''); // Clear selection after adding
    }
  };

  // Add selected text (from anywhere on page) to pending selections
  const addGlobalSelection = useCallback((text: string) => {
    if (text) {
      setPendingSelections(prev => [...prev, text]);
      // Optional: Provide feedback that selection was added
      console.log("Selection added:", text);
       // Maybe flash the chat window or show a temporary message
    }
  }, []); // No dependencies needed

  // --- Global Shortcut Listener ---
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Cmd+Ctrl+A (Mac) or Ctrl+Alt+A (Windows/Linux)
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      
      if (!event.key) return; // Ignore events without a key property
      
      const shortcutPressed = event.key.toLowerCase() === 'a' && event.ctrlKey && (
        (isMac && event.metaKey) || // Mac: Cmd+Ctrl+A
        (!isMac && event.altKey)   // Windows/Linux: Ctrl+Alt+A
      );

      if (shortcutPressed) {
        event.preventDefault(); // Prevent default browser behavior (e.g., selecting all)
        const selection = window.getSelection();
        const selectedText = selection ? selection.toString().trim() : '';
        if (selectedText) {
          addGlobalSelection(selectedText);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Cleanup listener on component unmount
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [addGlobalSelection]); // Add addGlobalSelection as dependency

  // --- Message Sending ---
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const userRequestText = inputText.trim();
    // Require either text input or pending selections
    if ((!userRequestText && pendingSelections.length === 0) || isChatLoading) {
        return;
    }

    setIsChatLoading(true);
    setChatError(null);

    // Optimistically add user message to UI
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      text: userRequestText || "Selection(s) added", // Provide feedback if only selections
      type: 'user',
      timestamp: new Date(),
      selections: [...pendingSelections],
    };
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    const currentSelections = [...pendingSelections]; // Capture selections for the API call
    setPendingSelections([]); // Clear pending selections

    // Prepare history for API (map to expected role 'model' for assistant)
    const apiHistory = messages.map(msg => ({
        role: msg.type === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.proposal?.explanation || msg.text }] // Send explanation if available, else text
    }));

    try {
        // --- Call the new API endpoint ---
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: apiHistory, // Send the formatted history
                currentStory: currentStory || "", // Pass the current story context
                userRequest: userRequestText, // The user's typed message
                selections: currentSelections // The selections associated with this message
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
            throw new Error(errorData.error || `API request failed with status ${response.status}`);
        }

        const proposalResult: EditProposal = await response.json();

        // Notify parent component about the received proposal
        onReceiveProposal(proposalResult);

        // Add assistant message with the proposal
        const assistantMessage: Message = {
            id: `asst-${Date.now()}`,
            text: proposalResult.explanation, // Fallback text if needed, but explanation should exist
            type: 'assistant',
            timestamp: new Date(),
            proposal: proposalResult, // Store the structured proposal
            proposalActioned: false, // Mark as not actioned yet
        };
        setMessages(prev => [...prev, assistantMessage]);

    } catch (err: any) {
        console.error('Chat API request failed:', err);
        setChatError(err.message || 'Failed to get response from assistant.');
        // Optionally add an error message to the chat UI
        const errorMessage: Message = {
            id: `err-${Date.now()}`,
            text: `Error: ${err.message || 'Failed to get response from assistant.'}`,
            type: 'assistant', // Or a dedicated 'error' type
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMessage]);
    } finally {
        setIsChatLoading(false);
    }
  };

  // --- Handlers for Accept/Reject ---
  const handleAcceptEdit = (messageId: string, proposal: EditProposal) => {
    onAcceptProposal(proposal); // Call parent function to accept the change
    // Mark proposal as actioned to hide buttons
    setMessages(prev => prev.map(msg =>
      msg.id === messageId ? { ...msg, proposalActioned: true } : msg
    ));
  };

  const handleRejectEdit = (messageId: string) => {
     onRejectProposal(messageId); // Call parent function to reject
     // Mark proposal as actioned to hide buttons
     setMessages(prev => prev.map(msg =>
       msg.id === messageId ? { ...msg, proposalActioned: true, text: `Suggestion declined: ${msg.text}` } : msg // Optional: Update text
     ));
  };

  // Button handler to add current global selection
  const handleAddGlobalSelectionClick = () => {
      const selection = window.getSelection();
      const selectedText = selection ? selection.toString().trim() : '';
      if (selectedText) {
          addGlobalSelection(selectedText);
      } else {
          // Optional: Notify user that nothing is selected
          console.log("No text selected on the page.");
      }
  };

  return (
    <div
      className={`fixed right-4 top-4 bottom-4 w-80 bg-white/90 backdrop-blur-md rounded-lg shadow-lg border border-gray-200/70 flex flex-col transition-all duration-300 ${isCollapsed ? 'w-12 h-12' : ''} ${className} z-50`}
    >
      <div className="p-3 border-b border-gray-200/70 flex justify-between items-center cursor-pointer" onClick={() => setIsCollapsed(!isCollapsed)}>
        <h3 className={`font-medium text-gray-800 text-sm truncate pr-2`}>Chat Assistant</h3>
        <div className="flex items-center space-x-2">
          {!isCollapsed && (
            <button
              onClick={(e) => { e.stopPropagation(); onNewChat(); }}
              className="text-gray-500 hover:text-blue-600 hover:bg-blue-50 p-1 rounded"
              title="Start New Chat"
              aria-label="Start New Chat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                 <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <>
          <div
            className="flex-1 overflow-y-auto p-3 space-y-3"
            onMouseUp={handleTextSelectionInsideChat}
          >
            {messages.map(message => {
              // Extract original text for diff view if it's a 'replace' proposal
              let originalTextSegment = '';
              if (
                message.type === 'assistant' &&
                message.proposal?.type === 'replace' &&
                currentStory &&
                message.proposal.startIndex !== undefined &&
                message.proposal.endIndex !== undefined
              ) {
                originalTextSegment = currentStory.substring(
                  message.proposal.startIndex,
                  message.proposal.endIndex
                );
              }

              // Calculate diff if applicable
              const changes = originalTextSegment && message.proposal?.text
                ? Diff.diffChars(originalTextSegment, message.proposal.text)
                : [];

              return (
                <div
                  key={message.id}
                  className={`p-2 rounded-lg text-sm ${
                    message.type === 'user'
                      ? 'bg-blue-50 border border-blue-100 ml-auto max-w-[85%]'
                      : 'bg-gray-50 border border-gray-100 mr-auto max-w-[85%]'
                  }`}
                >
                  {/* Display user selections if present */}
                  {message.type === 'user' && message.selections && message.selections.length > 0 && (
                   <div className="mb-1 border-b border-dashed border-yellow-300 pb-1">
                     <span className="text-xs font-semibold text-yellow-700 block">Selections:</span>
                     {message.selections.map((selection, index) => (
                       <div key={index} className="text-xs bg-yellow-100 p-1 mt-1 rounded border border-yellow-200">
                         "{selection}"
                       </div>
                     ))}
                   </div>
                 )}

                  {/* Display message text (user text or assistant explanation) */}
                  <p className="text-gray-800 whitespace-pre-wrap break-words">{message.text}</p>

                  {/* Display Assistant Edit Proposal Diff and Actions */}
                  {message.type === 'assistant' && message.proposal && !message.proposalActioned &&
                   (message.proposal.type === 'replace' || message.proposal.type === 'insert' || message.proposal.type === 'delete') && (
                    <div className="mt-2 pt-2 border-t border-gray-200 flex justify-end space-x-2">
                      {/* Diff rendering is now moved to EditableText */}
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
                  {/* Indicate if proposal was actioned */}
                  {message.proposalActioned && (
                      <div className="mt-1 text-xs text-gray-400 italic">Suggestion actioned.</div>
                  )}

                  <div className="text-xs text-gray-400 mt-1 text-right">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              );
            })}
            {/* Display Loading Indicator */}
            {isChatLoading && (
                <div className="p-2 text-center text-xs text-gray-500">Assistant is thinking...</div>
            )}
             {/* Display Error Message */}
            {chatError && (
                 <div className="p-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg mt-2">
                    <span className="font-semibold">Error:</span> {chatError}
                 </div>
            )}
             {pendingSelections.length > 0 && (
              <div className="p-2 text-xs text-gray-600 bg-yellow-50 border border-yellow-200 rounded-lg mt-2 sticky bottom-0">
                <span className="font-semibold">Pending Selections ({pendingSelections.length}):</span>
                <ul className="list-disc list-inside ml-2 max-h-20 overflow-y-auto">
                  {pendingSelections.map((sel, i) => <li key={i} className="truncate">"{sel}"</li>)}
                </ul>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {selectedTextInsideChat && (
            <div className="p-2 border-t border-gray-200/70 bg-gray-50">
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

          <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-200/70">
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
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask for changes..."
                className="flex-1 p-2 text-sm border border-gray-300/70 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={isChatLoading}
              />
              <button
                type="submit"
                disabled={(!inputText.trim() && pendingSelections.length === 0) || isChatLoading}
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
        </>
      )}
    </div>
  );
} 