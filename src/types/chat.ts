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
  type: 'replace' | 'insert' | 'delete' | 'clarification' | 'none';
  explanation: string; // AI's explanation/reasoning
  contextParagraphIndices?: number[]; // Artificial indices [0, 1, ...] of targeted context paragraphs
  startIndex?: number; // Start char index in the *original* story context for the edit
  endIndex?: number; // End char index (exclusive) in the *original* story context for the edit
  text?: string; // New text content for replace/insert
} 