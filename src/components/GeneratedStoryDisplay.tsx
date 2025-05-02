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
    handleContinueNarrative: () => Promise<void>;
    isLoading: boolean;
    isAuthenticated: boolean;
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
    handleContinueNarrative,
    isLoading,
    isAuthenticated,
}) => {
    if (!generatedStory) return null;

    const canContinue = !!generatedStory && (!!activeStoryId || !isAuthenticated);
    const continueDisabled = isLoading || !canContinue || !!proposalForDiff;

    return (
        <div className="mt-8 bg-slate-50/50 border border-slate-200/80 rounded-lg shadow-inner">
            <div>
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
                {acceptStatus && !isLoading && (
                    <span className={`text-sm font-medium ${acceptStatus.type === 'success' ? 'text-green-600' : 'text-red-600'} order-first sm:order-none mr-auto`}>
                        {acceptStatus.message}
                    </span>
                )}
                <div className="flex space-x-3 w-full sm:w-auto justify-end">
                    <button
                        onClick={handleContinueNarrative}
                        disabled={continueDisabled}
                        className={`py-1 px-4 border rounded text-sm font-medium transition duration-150 ease-in-out
                            ${continueDisabled
                                ? 'bg-gray-200 text-gray-400 border-gray-300 cursor-not-allowed'
                                : 'border-blue-600 text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                            }
                        `}
                        title={continueDisabled ? (isLoading ? "Generation in progress..." : !canContinue ? "Cannot continue from this state" : "Cannot continue while reviewing changes") : "Generate the next part based on this text"}
                    >
                        {isLoading ? 'Generating...' : 'Continue Narrative'}
                    </button>

                    {isAuthenticated && (
                        <button
                            onClick={handleAccept}
                            disabled={!currentGenerationId || isAccepting || acceptStatus?.type === 'success' || !!proposalForDiff || isLoading}
                            className={`py-1 px-4 border rounded text-sm font-medium transition duration-150 ease-in-out
                                ${isAccepting ? 'bg-gray-200 text-gray-500 cursor-wait' :
                                    acceptStatus?.type === 'success' ? 'bg-green-100 text-green-700 border-green-300 cursor-not-allowed' :
                                    'border-green-600 text-green-700 hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed'}
                                `}
                            title={!isAuthenticated ? "Log in to save story parts" : (acceptStatus?.type === 'success' ? "Part already saved" : (isAccepting ? "Saving..." : "Save this generated part to your story"))}
                        >
                            {isAccepting ? 'Saving...' : acceptStatus?.type === 'success' ? 'Saved' : 'Save'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GeneratedStoryDisplay;
