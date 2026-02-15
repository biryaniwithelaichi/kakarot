# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kakarot is an Electron-based AI meeting assistant that captures dual audio (microphone + system), transcribes in real-time via AssemblyAI, detects questions, and provides contextual response suggestions using OpenAI.

## Development Commands

```bash
# Development (Vite + Electron with hot reload)
npm run dev:electron

# Type checking only
npm run typecheck

# Linting
npm run lint

# Production build (outputs to release/)
npm run build
```

## Architecture

### Process Model

Electron three-process architecture:
- **Main process** (`src/main/`): Node.js backend - audio capture, transcription, storage, AI services
- **Renderer process** (`src/renderer/`): React UI running in Chromium
- **Preload** (`src/preload/`): Secure IPC bridge exposing `window.kakarot` API

### Main Process Structure

```
src/main/
├── index.ts              # Entry point, app lifecycle
├── core/                 # Infrastructure
│   ├── logger.ts         # Structured logging (debug/info/warn/error)
│   └── container.ts      # Dependency injection container
├── handlers/             # IPC handlers by domain
│   ├── index.ts          # Registers all handlers
│   ├── recordingHandlers.ts
│   ├── meetingHandlers.ts
│   ├── settingsHandlers.ts
│   └── calloutHandlers.ts
├── data/                 # Data access layer
│   ├── database.ts       # SQLite connection (sql.js)
│   └── repositories/     # Repository pattern
│       ├── MeetingRepository.ts
│       ├── CalloutRepository.ts
│       └── SettingsRepository.ts
├── services/             # Business logic
│   ├── CalloutService.ts
│   ├── KnowledgeService.ts
│   ├── TranscriptionService.ts
│   ├── SystemAudioService.ts
│   ├── ExportService.ts
│   └── audio/            # Audio processing
│       ├── HeadphoneDetector.ts
│       └── processing/   # Audio pipeline
│           ├── IAudioProcessor.ts
│           ├── AudioPipeline.ts
│           └── AECProcessor.ts
├── providers/            # External API clients
│   └── OpenAIProvider.ts # Centralized OpenAI client
├── prompts/              # LLM prompt templates
│   ├── calloutPrompts.ts
│   └── summaryPrompts.ts
├── config/               # Constants and configuration
│   └── constants.ts      # All magic numbers, patterns, defaults
└── windows/              # Electron window management
    ├── mainWindow.ts
    └── calloutWindow.ts
```

### Dependency Injection

Services access dependencies via `getContainer()` from `src/main/core/container.ts`:
- `aiProvider` - OpenAIProvider instance
- `meetingRepo`, `calloutRepo`, `settingsRepo` - Data repositories
- `knowledgeService`, `calloutService` - Business services

### IPC Communication Pattern

All main<->renderer communication uses typed IPC channels defined in `src/shared/ipcChannels.ts`. Handlers are organized by domain in `src/main/handlers/`:
- `recordingHandlers` - start/stop/pause/resume, audio streaming
- `meetingHandlers` - CRUD, search, summarize, export
- `settingsHandlers` - API keys, preferences
- `calloutHandlers` - dismiss callout

### Renderer Structure

React 18 + Zustand for state (`src/renderer/stores/appStore.ts`). Three main views:
- `RecordingView` - Live recording UI with transcript display
- `HistoryView` - Past meetings browser
- `SettingsView` - API keys and preferences

Icons use `lucide-react` (direct imports). Floating `CalloutOverlay` renders in separate Electron window.

### Shared Utilities

Located in `src/shared/utils/formatters.ts`:
- `formatTimestamp(ms)` - Formats milliseconds as MM:SS
- `formatDuration(ms)` - Formats duration with hours if needed
- `getSpeakerLabel(source)` - Maps 'mic'/'system' to 'You'/'Other'

### Path Aliases

Configured in both `tsconfig.json` and `vite.config.ts`:
- `@/*` -> `src/*`
- `@main/*` -> `src/main/*`
- `@renderer/*` -> `src/renderer/*`
- `@shared/*` -> `src/shared/*`

## Key Files

- `src/main/core/container.ts` - DI container, service initialization
- `src/main/handlers/index.ts` - Registers all IPC handlers
- `src/main/data/database.ts` - SQLite schema and connection
- `src/shared/types.ts` - Shared TypeScript interfaces (Meeting, Callout, Settings)
- `src/shared/ipcChannels.ts` - Type-safe IPC channel constants
- `src/preload/index.ts` - Renderer API surface + global type declarations

## Environment Variables

Copy `.env.example` to `.env` and configure:
- `ASSEMBLYAI_API_KEY` - Real-time transcription
- `OPENAI_API_KEY` - Callout generation and summaries

## Native Modules

### Acoustic Echo Cancellation (native/)

C++ native module using WebRTC AEC3 for echo cancellation. Removes speaker audio picked up by the microphone when using speakers instead of headphones.

```bash
cd native
npm install
npm run build  # builds audio_capture_native.node
```

The module is loaded dynamically at runtime via `bindings('audio_capture_native')`. If unavailable, AEC gracefully bypasses and the app continues without echo cancellation.

Key files:
- `native/src/audio_capture_native.cc` - Node addon entry point
- `native/src/aec_processor.cc` - WebRTC AEC3 wrapper
- `native/webrtc/` - Pre-built WebRTC libs and headers

## Audio Processing Pipeline

Audio flows through `SystemAudioService`:

1. audiotee captures system audio (macOS loopback)
2. Web Audio API captures mic audio
3. AECProcessor removes echo using system audio as reference
4. Clean audio sent to transcription

## Platform Requirements

- macOS 13.2+ (for system audio loopback)
- Windows 10+
- Node.js 18+
- Python 3, node-gyp (for building native module)
