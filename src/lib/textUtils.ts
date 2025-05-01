// Helper to parse content into paragraphs based on newline characters
export const parseParagraphs = (text: string): string[] => {
  if (!text) return [];
  // Split by one or more newline characters.
  // Using a regex lookbehind (?<=\n) might be more robust to preserve trailing newlines if needed,
  // but simple split should work for basic cases.
  return text.split(/\n+/);
};

// Add other text utilities here if needed in the future 