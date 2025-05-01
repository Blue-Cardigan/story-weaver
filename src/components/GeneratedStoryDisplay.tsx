// src/components/GeneratedStoryDisplay.tsx
import React from 'react';
import EditableText from '@/components/EditableText';
import InlineChat from '@/components/InlineChat';
import type { EditProposal, ContextParagraphData } from '@/types/chat';

interface GeneratedStoryDisplayProps {
    generatedStory: string | null;
    setGeneratedStory: (value: string) => void;
    activeStoryId: string | null;
    proposalForDiff: EditProposal | null;
    diffStartIndex: number | null;
    diffEndIndex: number | null;
    handleContextSelection: (data: ContextParagraphData[]) => void;
    currentGenerationId: string | null;
    handleAcceptProposal: (proposal: EditProposal) => void;
    handleRejectProposal: () => void;
    handleReceiveProposal: (proposal: EditProposal) => void;
    handleNewChat: () => void;
    selectedChapterId: string | null;
    effectiveIdentifier: string | null;
    selectedContextData: ContextParagraphData[];
    handleClearContextSelection: () => void;
    acceptStatus: { type: 'success' | 'error'; message: string } | null;
    handleAccept: () => Promise<void>;
    isAccepting: boolean;
    clearSelectionsTrigger?: number;
}

const GeneratedStoryDisplay: React.FC<GeneratedStoryDisplayProps> = ({
    generatedStory,
    setGeneratedStory,
    activeStoryId,
    proposalForDiff,
    diffStartIndex,
    diffEndIndex,
    handleContextSelection,
    currentGenerationId,
    handleAcceptProposal,
    handleRejectProposal,
    handleReceiveProposal,
    handleNewChat,
    selectedChapterId,
    effectiveIdentifier,
    selectedContextData,
    handleClearContextSelection,
    acceptStatus,
    handleAccept,
    isAccepting,
    clearSelectionsTrigger,
}) => {
    if (!generatedStory) return null;

    return (
        <div className="mt-8 bg-slate-50/50 border border-slate-200/80 rounded-lg shadow-inner">
            <h2 className={`text-xl font-semibold text-slate-700 ${activeStoryId ? 'px-6 pt-6' : ''}`}>
                {activeStoryId ? 'Generated Next Part' : ''}
            </h2>
            <div className={`${activeStoryId ? 'pt-6' : ''}`}>
                <EditableText
                    value={generatedStory}
                    onChange={setGeneratedStory}
                    placeholder="Your story will appear here..."
                    className="bg-white/80 rounded-md"
                    proposalForDiff={proposalForDiff}
                    diffStartIndex={diffStartIndex}
                    diffEndIndex={diffEndIndex}
                    onContextSelectionChange={handleContextSelection}
                    handleAcceptProposal={handleAcceptProposal}
                    handleRejectProposal={handleRejectProposal}
                    clearSelectionsTrigger={clearSelectionsTrigger}
                />

                <InlineChat
                    currentStory={generatedStory}
                    currentGenerationId={currentGenerationId}
                    onReceiveProposal={handleReceiveProposal}
                    onNewChat={handleNewChat}
                    storyContext={{
                        storyId: activeStoryId ?? undefined,
                        chapterId: selectedChapterId ?? undefined,
                        effectiveIdentifier: effectiveIdentifier ?? undefined,
                    }}
                    selectedContextData={selectedContextData}
                    storyForContext={generatedStory}
                    onClearContextSelection={handleClearContextSelection}
                    className="mt-0 pt-0 border-t-0 shadow-none bg-transparent"
                />
            </div>

            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row justify-end items-center space-y-2 sm:space-y-0 sm:space-x-3 px-6 pb-4">
                {acceptStatus && (
                    <span className={`text-sm font-medium ${acceptStatus.type === 'success' ? 'text-green-600' : 'text-red-600'} order-first sm:order-none`}>
                        {acceptStatus.message}
                    </span>
                )}
                <div className="flex space-x-3 w-full sm:w-auto justify-end">
                    <button
                        onClick={handleAccept}
                        disabled={!currentGenerationId || isAccepting || acceptStatus?.type === 'success'}
                        className={`py-1 px-4 border rounded text-sm font-medium transition duration-150 ease-in-out
                              ${isAccepting ? 'bg-gray-200 text-gray-500 cursor-wait' :
                                acceptStatus?.type === 'success' ? 'bg-green-100 text-green-700 border-green-300 cursor-not-allowed' :
                                'border-green-600 text-green-700 hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed'}
                            `}
                    >
                        {isAccepting ? 'Saving...' : acceptStatus?.type === 'success' ? 'Saved' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GeneratedStoryDisplay;
