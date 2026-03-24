/**
 * Normalizes text by removing non-breaking spaces, multiple spaces, and trimming.
 * If the text doesn't end with a punctuation mark (., !, or ?), it adds a period.
 */
export function normalizeTextWithPunctuation(text: string): string {
  if (!text) return "";
  
  const normalized = text
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";

  // If it doesn't end with ., !, or ?, add a period.
  if (!/[.!?]$/.test(normalized)) {
    return `${normalized}.`;
  }

  return normalized;
}

/**
 * Normalizes text and ensures it ends with a punctuation mark.
 * Joins multiple text lines/notes with double newlines.
 */
export function joinNotesWithPunctuation(notes: string[]): string[] {
  return notes
    .map(normalizeTextWithPunctuation)
    .filter(Boolean);
}

/**
 * Joins multiple text lines/notes with double newlines.
 */
export function joinNotesWithDoubleNewline(notes: string[]): string {
  return joinNotesWithPunctuation(notes).join("\n\n");
}
