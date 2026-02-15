/**
 * Greeting detection utility
 * Detects common greetings in user messages
 */

// Greeting words
const GREETING_WORDS = [
  'hi',
  'hey',
  'hello',
  'yo',
  'sup',
  'hiya',
  'howdy',
  'greetings',
];

// Casual address terms
const CASUAL_TERMS = [
  'there',
  'bud',
  'buddy',
  'friend',
  'mate',
  'man',
  'dude',
  'chief',
  'pal',
  'claude',
  'assistant',
];

// Time-based greetings
const TIME_GREETINGS = [
  'good morning',
  'good afternoon',
  'good evening',
  'good night',
  'morning',
  'afternoon',
  'evening',
];

// Question form greetings
const QUESTION_GREETINGS = [
  "how are you",
  "how's it going",
  "how is it going",
  "what's up",
  "whats up",
  "how are things",
  "how's everything",
];

/**
 * Check if a message is ONLY a greeting (no request after)
 * @param message - User message to check
 * @returns true if the message is purely a greeting
 */
export function isPureGreeting(message: string): boolean {
  const trimmedMessage = message.trim().toLowerCase();

  // Empty messages are not greetings
  if (!trimmedMessage) {
    return false;
  }

  // Remove common punctuation
  const cleanMessage = trimmedMessage.replace(/[!.?,;]+$/g, '').trim();

  // Check for time-based greetings
  if (TIME_GREETINGS.some(g => cleanMessage === g)) {
    return true;
  }

  // Check for question form greetings
  if (QUESTION_GREETINGS.some(g => cleanMessage === g)) {
    return true;
  }

  // Check for greeting word alone
  if (GREETING_WORDS.includes(cleanMessage)) {
    return true;
  }

  // Check for greeting word + casual term (e.g., "hey bud", "hi there")
  const words = cleanMessage.split(/\s+/);
  if (words.length === 2) {
    const [first, second] = words;
    if (GREETING_WORDS.includes(first) && CASUAL_TERMS.includes(second)) {
      return true;
    }
  }

  // Check for greeting word + casual term with punctuation (e.g., "hey there!")
  if (words.length >= 2) {
    const first = words[0];
    const secondClean = words[1].replace(/[!.?,;]+$/g, '');
    if (GREETING_WORDS.includes(first) && CASUAL_TERMS.includes(secondClean) && words.length === 2) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a message starts with a greeting (may have request after)
 * @param message - User message to check
 * @returns true if the message starts with a greeting
 */
export function startsWithGreeting(message: string): boolean {
  const trimmedMessage = message.trim().toLowerCase();

  // Check if it starts with any greeting word
  for (const greeting of GREETING_WORDS) {
    const pattern = new RegExp(`^${greeting}\\b`, 'i');
    if (pattern.test(trimmedMessage)) {
      return true;
    }
  }

  // Check for time-based greetings
  for (const greeting of TIME_GREETINGS) {
    if (trimmedMessage.startsWith(greeting)) {
      return true;
    }
  }

  return false;
}

/**
 * Strip greeting from the start of a message to extract the actual request
 * @param message - User message
 * @returns The message with greeting removed, or original if no greeting
 */
export function stripGreeting(message: string): string {
  const trimmedMessage = message.trim();
  const lowerMessage = trimmedMessage.toLowerCase();

  // Try to remove time-based greetings first (longer patterns)
  for (const greeting of TIME_GREETINGS) {
    if (lowerMessage.startsWith(greeting)) {
      const rest = trimmedMessage.substring(greeting.length).trim();
      // Remove leading punctuation and conjunctions
      return rest.replace(/^[,!.;]+\s*/, '').replace(/^(and|but|so|then)\s+/i, '').trim();
    }
  }

  // Try to remove greeting words
  for (const greeting of GREETING_WORDS) {
    const pattern = new RegExp(`^${greeting}\\b`, 'i');
    if (pattern.test(lowerMessage)) {
      let rest = trimmedMessage.substring(greeting.length).trim();

      // Check if followed by a casual term
      const restLower = rest.toLowerCase();
      for (const term of CASUAL_TERMS) {
        const termPattern = new RegExp(`^${term}\\b`, 'i');
        if (termPattern.test(restLower)) {
          rest = rest.substring(term.length).trim();
          break;
        }
      }

      // Remove leading punctuation and conjunctions
      rest = rest.replace(/^[,!.;]+\s*/, '').replace(/^(and|but|so|then)\s+/i, '').trim();
      return rest;
    }
  }

  return trimmedMessage;
}

/**
 * Legacy function for backwards compatibility
 * Now checks if message is ONLY a greeting
 */
export function isGreeting(message: string): boolean {
  return isPureGreeting(message);
}

/**
 * Generate a contextual greeting response
 * @param userMessage - The user's greeting message
 * @returns A friendly greeting response
 */
export function getGreetingResponse(userMessage?: string): string {
  const responses = [
    "Hi! I'm here to help you prepare for meetings and find information from your past conversations. You can ask me about upcoming meetings, search for past discussions, or request meeting notes.",
    "Hello! I can help you with meeting prep, search your meeting history, or answer questions about past conversations. What would you like to know?",
    "Hey there! I'm your meeting assistant. I can help you prepare for upcoming meetings, find information from past discussions, or answer questions about your meeting history.",
  ];

  // Return a random response to keep it varied
  return responses[Math.floor(Math.random() * responses.length)];
}
