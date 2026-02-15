# Conversational Command Bar (Omnibar) Implementation Plan

## Overview
Revamp the Meeting Prep section to use a conversational omnibar where users can type natural language queries like "Hey I have a meeting with xyz, help me prep for it" and get strategic, opinionated responses with follow-up capability.

---

## 1. New Types (src/shared/types.ts)

```typescript
// Conversational Prep Chat Types
export interface PrepChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: PrepCitation[];
  suggestedActions?: string[];
  meetingReferences?: { meetingId: string; title: string; date: string }[];
}

export interface PrepConversation {
  id: string;
  messages: PrepChatMessage[];
  createdAt: string;
  updatedAt: string;
  participantContext?: {
    name: string;
    email: string | null;
    meetingIds: string[];
  };
}

export interface PrepChatInput {
  message: string;
  conversationId?: string;
  context?: {
    personQuery?: string;
    meetingIds?: string[];
  };
}

export interface PrepChatResponse {
  conversationId: string;
  message: PrepChatMessage;
  conversation?: PrepConversation;
}
```

---

## 2. Backend: PrepService.ts Changes

Add new method `generatePrepChatResponse` with strategic prompting:

**System Prompt Guidelines (enforced in code):**
- NO PREAMBLES - Never start with "I'd be happy to help"
- DON'T RESTATE - Never repeat the user's question
- BE DECISIVE - Give ONE clear recommendation
- INVERTED PYRAMID - Critical info first
- CONCISE - Short sentences, bullets, **bold** for emphasis
- CITE SOURCES - Inline citations like "the deadline is Monday [1]"
- ACTION-ORIENTED - End with specific next steps

**Key Features:**
- Conversation history support for follow-ups
- Meeting search detection from natural language
- Citation extraction from referenced meetings
- Person detection from natural language ("meeting with John")

---

## 3. IPC Plumbing

**New channel in ipcChannels.ts:**
```typescript
PREP_CHAT_SEND: 'prep:chatSend',
```

**Handler in prepHandlers.ts:**
- Handle chat messages with conversation context
- Return formatted responses with citations

**Preload exposure:**
```typescript
prep: {
  chatSend: (input, conversation?) => ipcRenderer.invoke(...)
}
```

---

## 4. UI Changes (PrepView.tsx)

### Replace Quick Mode with Omnibar

**Component Structure:**
```
PrepView
├── Header with mode toggle (Omnibar | Structured)
├── PrepOmnibar (when no conversation)
│   ├── Large centered input ("Hey, I have a meeting with...")
│   ├── Send button
│   ├── Placeholder suggestions ("Search older meetings", "Any questions?")
│   └── Recent people chips (quick access)
├── PrepChatView (when conversation active)
│   ├── Message list (scrollable, auto-scroll)
│   │   ├── User messages (right-aligned, purple)
│   │   └── Assistant messages (left-aligned, markdown rendered)
│   ├── Input bar at bottom (for follow-ups)
│   ├── Suggested follow-ups (quick action buttons)
│   └── "New conversation" button
└── Structured mode (existing advanced mode, renamed)
```

**State Management:**
- Local component state with `useState`
- localStorage persistence for conversation history (last 20)
- Pattern matches existing `dismissedEventIds` approach

**Markdown Rendering:**
- Reuse existing PrepView markdown parsing (lines 1386-1441)
- Add citation badge support `[1]` with source reference

---

## 5. Design Decisions

| Question | Decision |
|----------|----------|
| Persist conversations? | Yes, localStorage (last 20) |
| Streaming responses? | No (full response only for Phase 1) |
| Search older meetings? | Inline detection from natural language |
| Keep Advanced mode? | Yes, renamed to "Structured Prep" |

---

## 6. Implementation Sequence

1. **Types** - Add conversation types to `types.ts`
2. **Backend** - Implement `generatePrepChatResponse` in `PrepService.ts`
3. **IPC** - Add channel, handler, preload exposure
4. **UI Skeleton** - Create Omnibar input and message display
5. **Markdown** - Reuse rendering with citation support
6. **Persistence** - Add localStorage conversation history
7. **Polish** - Loading states, error handling

---

## 7. File Changes Summary

| File | Changes |
|------|---------|
| `src/shared/types.ts` | Add chat types |
| `src/shared/ipcChannels.ts` | Add `PREP_CHAT_SEND` |
| `src/main/handlers/prepHandlers.ts` | Add chat handler |
| `src/main/services/PrepService.ts` | Add `generatePrepChatResponse` |
| `src/preload/index.ts` | Expose `chatSend` |
| `src/renderer/components/PrepView.tsx` | Omnibar UI + chat view |

---

## 8. Communication Style (Enforced via System Prompt)

The AI responses will follow these guidelines from the user's spec:

**Response Format:**
- **No preambles**: Dive straight into the answer
- **Confident tone**: Present one clear recommendation
- **Inverted pyramid**: Critical info first, details after
- **Scannable**: ## headers, bullets, **bold** for emphasis
- **Citations**: `[1]` style referencing past meetings

**Tone:**
- Conversational: "I can see the pattern here...", "I'd recommend..."
- Strategic: Connect dots, flag patterns, give direct advice
- Expert colleague: Not customer service bot

**Example Response:**
```markdown
## Quick Context on John

You last spoke 3 days ago about the API integration [1]. He's been responsive but raised concerns about timeline.

**Key points to address:**
- The deadline moved to Friday [1] - confirm he's aware
- He asked about rate limits [2] - bring the updated docs

**Suggested opener:** "Wanted to follow up on the timeline concern you raised"

[1] API Sync Meeting - Jan 20
[2] Technical Review - Jan 15
```
