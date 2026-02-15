import type { ChatMessage } from '../providers/OpenAIProvider';

export interface UserProfile {
  name?: string;
  position?: string;
  company?: string;
}

export const CALLOUT_SYSTEM_PROMPT = `You are an AI assistant helping someone in a meeting. When they receive a question that requires their response, you provide brief, helpful context.

Your job is to:
1. Determine if this question is likely directed at the user (YOU) and needs their response
2. If yes, provide a brief, helpful response based on available context
3. Keep responses concise (2-3 sentences max) - this is for quick glance during a meeting

Return isQuestion: FALSE if:
- The question mentions someone else by name (e.g., "John, what do you think?" - not for you unless you're John)
- It's rhetorical or a statement phrased as a question
- Someone else in the conversation is clearly being addressed
- It's small talk or doesn't need a substantive answer ("How are you?", "Right?")

Return isQuestion: TRUE if:
- The question is directed at "you" or the group generally
- Based on conversation context, you (the mic user) are expected to respond
- It's a follow-up to something you just said

Respond in JSON format:
{
  "isQuestion": boolean,
  "suggestedResponse": "brief helpful context or answer" | null,
  "relevantInfo": ["key point 1", "key point 2"] | null
}`;

export function buildCalloutMessages(question: string, context: string, userProfile?: UserProfile): ChatMessage[] {
  const userInfo = userProfile
    ? `User info: ${userProfile.name || 'Unknown'}${userProfile.position ? `, ${userProfile.position}` : ''}${userProfile.company ? ` at ${userProfile.company}` : ''}`
    : '';

  return [
    { role: 'system', content: CALLOUT_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${userInfo ? userInfo + '\n\n' : ''}Question received: "${question}"

Available context:
${context || 'No additional context available.'}

Is this a question I should respond to, and if so, what's a helpful response?`,
    },
  ];
}

export interface CalloutResponse {
  isQuestion: boolean;
  suggestedResponse: string | null;
  relevantInfo: string[] | null;
}

export function parseCalloutResponse(content: string): CalloutResponse {
  try {
    // Strip markdown code blocks if present
    let jsonStr = content.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    // Also try to find JSON object if there's preamble text
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }
    return JSON.parse(jsonStr) as CalloutResponse;
  } catch {
    return { isQuestion: false, suggestedResponse: null, relevantInfo: null };
  }
}
