import { useState } from 'react';

interface ChatMessage {
  id: string;
  text: string;
  type: 'user' | 'system';
  timestamp: Date;
  highlights?: string[];
}

interface ChatContextProps {
  messages: ChatMessage[];
  onHighlight: (text: string) => void;
}

export default function ChatContext({ messages, onHighlight }: ChatContextProps) {
  const [selectedText, setSelectedText] = useState('');

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      setSelectedText(selection.toString().trim());
    }
  };

  const handleHighlight = () => {
    if (selectedText) {
      onHighlight(selectedText);
      setSelectedText('');
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-white/90 rounded-lg shadow-lg border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">Chat Context</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`p-3 rounded-lg ${
              message.type === 'user' 
                ? 'bg-blue-50 border border-blue-100' 
                : 'bg-gray-50 border border-gray-100'
            }`}
            onMouseUp={handleTextSelection}
          >
            <div className="text-sm text-gray-600 mb-1">
              {message.timestamp.toLocaleTimeString()}
            </div>
            <p className="text-gray-800 whitespace-pre-wrap">{message.text}</p>
            {message.highlights && message.highlights.length > 0 && (
              <div className="mt-2 space-y-1">
                {message.highlights.map((highlight, index) => (
                  <div
                    key={index}
                    className="text-sm bg-yellow-100 p-2 rounded border border-yellow-200"
                  >
                    {highlight}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedText && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 truncate flex-1 mr-4">
              Selected: {selectedText}
            </p>
            <button
              onClick={handleHighlight}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              Highlight
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 