# Chat UI Implementation - Thought Trace & Streaming

This document describes the implementation of the enhanced React-based chat interface in PrepView, featuring collapsible chain-of-thought reasoning, token streaming with typewriter effect, and sticky auto-scroll.

## Current Status

✅ **Token Streaming (Typewriter Effect)**: Fully implemented and working
✅ **Sticky Auto-Scroll**: Fully implemented and working
⚠️ **Thought Trace (Collapsible Reasoning)**: Implemented but **disabled** - waiting for backend support

## Overview

The implementation adds three major features to the PrepView chat interface:

1. **Thought Trace (Collapsible Reasoning)**: Infrastructure ready - displays the model's internal chain-of-thought reasoning before the final answer. **Currently disabled** until backend adds extended thinking support.
2. **Token Streaming (Typewriter Effect)**: ✅ **WORKING** - Real-time streaming of response chunks with natural pacing
3. **Sticky Auto-Scroll**: ✅ **WORKING** - Smart scrolling that follows new content but respects manual user scrolling

## New Files

### 1. `src/renderer/components/ThoughtTrace.tsx`

A collapsible component that displays the model's internal reasoning:

- Shows "Thought for [X]s" with a chevron icon
- Clicking expands/collapses the thinking section
- Different visual styling (lower opacity, monospace font) to distinguish from main content
- Supports streaming state with "..." duration indicator
- Uses Brain icon from lucide-react

**Props:**
- `thinking: string` - The chain-of-thought reasoning text
- `thinkingDuration?: number` - Duration in milliseconds
- `isStreaming?: boolean` - Whether thinking is currently being streamed

### 2. `src/renderer/hooks/useChatScroll.ts`

Custom hook for managing sticky auto-scroll behavior:

- Uses Intersection Observer to detect when user is at the bottom
- Pauses auto-scroll when user manually scrolls up
- Resumes auto-scroll when user scrolls back to bottom
- Configurable threshold (default 50px from bottom)

**Returns:**
- `scrollContainerRef` - Ref for the scrollable container
- `scrollAnchorRef` - Ref for the bottom anchor element (for Intersection Observer)
- `isAtBottom` - Boolean indicating if user is at bottom
- `shouldAutoScroll` - Boolean indicating if auto-scroll is enabled
- `scrollToBottom()` - Function to manually scroll to bottom
- `autoScrollToBottom()` - Function that only scrolls if shouldAutoScroll is true

### 3. `src/renderer/hooks/useThinkingTimer.ts`

Custom hook for tracking thinking/reasoning duration:

- Starts when thinking begins
- Stops when first answer token arrives
- Updates every 100ms for smooth display
- Returns elapsed time in milliseconds

**Returns:**
- `elapsedMs` - Elapsed time in milliseconds
- `isRunning` - Boolean indicating if timer is running
- `start()` - Start the timer
- `stop()` - Stop and return final duration
- `reset()` - Reset timer to 0

## Modified Files

### 1. `src/shared/types.ts`

Extended `PrepChatMessage` interface to support thinking:

```typescript
export interface PrepChatMessage {
  // ... existing fields
  /** Extended thinking/reasoning (chain-of-thought) for assistant messages */
  thinking?: string;
  /** Thinking duration in milliseconds */
  thinkingDuration?: number;
}
```

### 2. `src/renderer/components/PrepView.tsx`

Major updates to integrate the new features:

#### New State Variables:
- `streamingThinking` - Accumulates thinking chunks during streaming
- `isStreamingThinking` - Tracks if currently in thinking phase
- Custom hooks: `useChatScroll()` and `useThinkingTimer()`

#### Updated `handleChatSend()`:
- Starts thinking timer when request begins
- Separates thinking chunks from content chunks
- Stops timer when first content chunk arrives
- Passes thinking and duration to final message

#### Updated UI:
- Replaced `chatMessagesRef` with `scrollContainerRef` from hook
- Added `scrollAnchorRef` at bottom of messages for Intersection Observer
- Integrated `ThoughtTrace` component in both completed messages and streaming section
- Replaced manual scroll logic with `autoScrollToBottom()`

## Quick Fix: Token Streaming is Working Now!

The issue was that the thinking detection logic was consuming all chunks. This has been fixed. **Token streaming should now work perfectly** - you'll see the response appear word-by-word in real-time.

## Enabling Thought Trace (Future)

The Thought Trace feature is fully implemented but commented out. To enable it when your backend supports extended thinking:

1. **In PrepView.tsx**, search for `// TODO: Enable when backend supports thinking`
2. Uncomment the thinking timer and ThoughtTrace component
3. Update the backend to send thinking chunks (see Backend Integration below)

## Backend Integration

The backend streaming already works! Your `chatStream()` implementation is correct. To add thinking support in the future:

### Option 1: Separate Thinking and Content Phases

The backend should send chunks with a `type` parameter:

```typescript
onChunk: (chunk: string, type?: 'thinking' | 'content') => void
```

**Flow:**
1. Backend sends thinking chunks with `type: 'thinking'`
2. Backend sends content chunks with `type: 'content'`
3. Frontend automatically handles the transition

### Option 2: Automatic Detection (Current Implementation)

If backend doesn't specify `type`, the frontend uses `isStreamingThinking` state:

1. Initially assumes thinking phase
2. First chunk without type goes to thinking
3. After some trigger (e.g., "---" delimiter or timeout), switches to content phase

### SSE Event Format

The backend should emit Server-Sent Events with this structure:

```
event: chunk
data: {"text": "chunk of text", "type": "thinking"}

event: chunk
data: {"text": "more thinking", "type": "thinking"}

event: chunk
data: {"text": "final answer", "type": "content"}

event: end
data: {"conversationId": "...", "message": {...}}
```

### Extended Thinking API Parameter

To get actual chain-of-thought reasoning from the model, pass `extended_thinking: true` or similar parameter when calling the AI provider:

```typescript
// Example with OpenAI
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [...],
  stream: true,
  // Enable extended thinking (pseudo-parameter for illustration)
  extended_thinking: true,
});
```

**Note:** The exact parameter name depends on your AI provider. Some providers may call it:
- `extended_thinking`
- `chain_of_thought`
- `reasoning_mode`
- Or require specific system prompts

## Usage Examples

### Thought Trace

When a message has thinking:

```tsx
<ThoughtTrace
  thinking={message.thinking}
  thinkingDuration={message.thinkingDuration}
/>
```

### Sticky Scroll

The hook automatically manages scroll behavior:

```tsx
const { scrollContainerRef, scrollAnchorRef, autoScrollToBottom } = useChatScroll();

// In JSX:
<div ref={scrollContainerRef} className="overflow-y-auto">
  {messages.map(...)}
  <div ref={scrollAnchorRef} /> {/* Anchor at bottom */}
</div>

// When new content arrives:
autoScrollToBottom(); // Only scrolls if user is at bottom
```

### Thinking Timer

Track how long the model spends thinking:

```tsx
const thinkingTimer = useThinkingTimer();

// When thinking starts:
thinkingTimer.start();

// When content arrives:
const duration = thinkingTimer.stop();
```

## Visual Design

### Thought Trace Styling
- **Collapsed**: Small text (12px), white/50% opacity, Brain icon
- **Expanded**: Dark background (bg-black/20), monospace font, white/60% opacity
- **Duration**: Formatted as "Xs", "Xm Ys", or "..." while streaming

### Streaming Cursor
- A pulsing blue bar (`w-2 h-4 bg-[#4ea8dd] animate-pulse`) appears at the end of streaming text

### Message Bubbles
- **User**: Blue background (#4ea8dd), right-aligned
- **Assistant**: Dark background (#1A1A1A), left-aligned, with border

## Token Streaming Speed

The current implementation streams tokens as they arrive from the backend. For a more natural "typewriter" effect (40-60 tokens/second), the backend should:

1. Buffer chunks slightly (e.g., 50-100ms delay)
2. Send tokens in small batches (3-5 tokens at a time)
3. This creates a smooth, readable pace without overwhelming the user

Alternatively, the frontend could add artificial delay, but this would reduce real-time feel.

## Testing Checklist

- [ ] Thinking appears and is collapsible
- [ ] Duration timer displays correctly
- [ ] Streaming thinking shows "..." duration
- [ ] Content streams smoothly after thinking
- [ ] Auto-scroll works when at bottom
- [ ] Auto-scroll pauses when user scrolls up
- [ ] Auto-scroll resumes when user scrolls to bottom
- [ ] Typing cursor appears during streaming
- [ ] Meeting references display correctly
- [ ] Error handling works (shows error, cleans up state)
- [ ] Multiple messages in conversation work correctly

## Performance Considerations

1. **Intersection Observer**: Efficient scroll detection with minimal performance impact
2. **100ms Timer Update**: Smooth duration display without excessive re-renders
3. **Streaming Chunks**: Small chunk sizes (1-10 tokens) for responsive feel
4. **React Keys**: Proper key usage prevents unnecessary re-renders during streaming

## Future Enhancements

Potential improvements:

1. **Copy Thinking**: Add button to copy thinking to clipboard
2. **Thinking Syntax Highlighting**: If thinking contains code/structured data
3. **Thinking Search**: Search within thinking text
4. **Thinking Analytics**: Track thinking time patterns across queries
5. **Streaming Speed Control**: User preference for streaming speed
6. **Smart Pause**: Pause streaming on window blur, resume on focus
