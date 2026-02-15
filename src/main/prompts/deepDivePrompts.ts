/**
 * Prompts for enhanced Deep Dive feature (Granola-style zoom)
 */

export const MODEL_VERSION = 'gpt-4o';
export const PROMPT_VERSION = 'v1';

interface ZoomPromptParams {
  noteBlockText: string;
  transcriptSlice: string;
  speakers?: string[];
}

/**
 * Generate a zoom prompt for summarizing relevant transcript sections
 *
 * Returns structured JSON with:
 * - summary: 2-4 sentence overview
 * - keyPoints: 3-7 bullet points
 * - notableQuotes: 1-3 quotes with speaker and timestamp
 */
export function createZoomPrompt(params: ZoomPromptParams): string {
  const { noteBlockText, transcriptSlice, speakers } = params;

  const speakerContext = speakers && speakers.length > 0
    ? `\n\nSpeakers in this section: ${speakers.join(', ')}`
    : '';

  return `You are analyzing a meeting transcript to provide context for a specific note that was taken.

**Note from meeting:**
"${noteBlockText}"

**Relevant transcript section:**
${transcriptSlice}${speakerContext}

Your task is to create a focused summary of ONLY what's in this transcript section, with emphasis on why this note was important.

Return a JSON object with this exact structure:

{
  "summary": "A 2-4 sentence high-level overview explaining what was discussed in this section and why it's relevant to the note above.",
  "keyPoints": [
    "First key point: decision, concern, or important detail",
    "Second key point: ...",
    "Third key point: ..."
  ],
  "notableQuotes": [
    {
      "speaker": "Speaker Name or 'Unknown'",
      "timestamp": "00:12:34",
      "quote": "Exact wording from the transcript that's particularly important or insightful"
    }
  ]
}

Guidelines:
- **summary**: Focus on the "why" behind the note - what context makes this noteworthy?
- **keyPoints**: Include 3-7 bullet points. Prioritize:
  - Decisions made
  - Concerns or objections raised
  - Action items or next steps
  - Key reasoning or rationale
- **notableQuotes**: Include 1-3 direct quotes that are:
  - Particularly insightful or well-stated
  - Capture a key decision or concern
  - Provide important context
  - If no standout quotes exist, return empty array []
- **timestamp format**: Use HH:MM:SS if available in transcript, otherwise use "Unknown"
- **speaker names**: Use actual names if provided, otherwise "Speaker 1", "Speaker 2", etc., or "Unknown"

Only summarize what's actually in the transcript slice provided. Do not add information from outside context.

Return ONLY the JSON object, no markdown formatting or code blocks.`;
}

/**
 * Generate a simpler prompt for very short transcript slices
 * that don't need full summarization
 */
export function createSimpleContextPrompt(params: {
  noteBlockText: string;
  transcriptSlice: string;
}): string {
  const { noteBlockText, transcriptSlice } = params;

  return `You are providing brief context for a meeting note.

**Note:**
"${noteBlockText}"

**Transcript section:**
${transcriptSlice}

Provide a 1-2 sentence explanation of how this transcript section relates to the note above.

Return ONLY plain text, no JSON formatting.`;
}

/**
 * Determine if transcript should be summarized or shown raw
 * Based on token count and fragmentation
 */
export function shouldSummarize(tokenCount: number, chunkCount: number): boolean {
  const SUMMARY_TOKEN_THRESHOLD = 250;
  const MAX_CHUNKS_FOR_RAW = 2;

  // If very short, show raw transcript
  if (tokenCount < SUMMARY_TOKEN_THRESHOLD && chunkCount <= MAX_CHUNKS_FOR_RAW) {
    return false;
  }

  // Otherwise, generate summary
  return true;
}
