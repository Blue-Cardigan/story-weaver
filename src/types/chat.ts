// src/types/chat.ts

// Data structure for context paragraphs passed between components and to the API
export interface ContextParagraphData {
  index: number; // Original paragraph index in the full text
  text: string; // Content of the paragraph
  startIndex: number; // Original start character index in the full text
  endIndex: number; // Original end character index (exclusive) in the full text
}

// Structure for edit proposals from the AI
export interface EditProposal {
  // Type of edit: replace a span, insert text, delete a span, ask for clarification, no change needed, or replace the entire text
  type: 'replace' | 'insert' | 'delete' | 'clarification' | 'none' | 'replace_all';
  // Explanation from the AI for the user
  explanation: string;
  // The text content for 'replace', 'insert', or 'replace_all' types
  text?: string;
  // Character index where the edit starts (inclusive) - Required for replace/insert/delete unless contextParagraphIndices is used
  startIndex?: number;
  // Character index where the edit ends (exclusive) - Required for replace/delete unless contextParagraphIndices is used
  endIndex?: number;
  // Optional: Original indices from the ContextParagraphData[] if the edit targets those specific paragraphs
  // Used INTERNALLY in the API route, should not be part of the final response sent to the client.
  contextParagraphIndices?: number[];
} 