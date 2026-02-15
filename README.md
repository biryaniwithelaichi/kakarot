# Kakarot

Electron app for meeting transcription with real-time audio capture and AI-powered note generation.

## What it does

- Captures mic + system audio separately (you vs others)
- Real-time transcription via AssemblyAI streaming
- Detects questions and shows floating callout with suggested responses
- Stores meetings in local SQLite, searchable
- Generates summaries and action items post-meeting

## Requirements

- Node.js 18+
- macOS 13.2+ or Windows 10+
- Python 3, node-gyp (for native module)
- API keys: AssemblyAI, OpenAI (or Gemini)

## Setup

```bash
git clone https://github.com/user/kakarot.git
cd kakarot

# Build native audio module (optional, improves AEC)
cd native && npm install && npm run build && cd ..

# Install deps
npm install

# Configure
cp .env.example .env
# Add your API keys to .env

# Run
npm run dev:electron
```

## Build

```bash
npm run build  # outputs to release/
```

## Architecture

```
src/
├── main/           # Electron main process
│   ├── handlers/   # IPC handlers (recording, meetings, settings)
│   ├── services/   # Business logic (transcription, callouts, audio)
│   ├── data/       # SQLite repos
│   └── providers/  # OpenAI/Gemini clients
├── renderer/       # React UI
│   ├── components/ # Views (Recording, History, Settings, Prep)
│   └── stores/     # Zustand state
├── shared/         # Types, IPC channels
└── preload/        # IPC bridge
```

Main process handles audio capture, transcription, and AI calls. Renderer is React + Tailwind. Communication via typed IPC.

## Audio pipeline

1. System audio captured via audiotee (macOS loopback)
2. Mic audio via Web Audio API
3. AEC processor removes speaker bleed from mic (C++/WebRTC AEC3)
4. Both streams sent to AssemblyAI for transcription
5. Transcripts labeled by source (you/other)

The AEC module is optional - app works without it but transcription quality improves when using speakers instead of headphones.

## Stack

| Layer | Tech |
|-------|------|
| Shell | Electron 33 |
| UI | React 18, Tailwind, Zustand |
| Build | Vite, electron-builder |
| Audio | audiotee, Web Audio API |
| AEC | C++ / WebRTC AEC3 |
| Transcription | AssemblyAI SDK |
| LLM | OpenAI/Gemini |
| DB | sql.js (SQLite/WASM) |

## Dev commands

```bash
npm run dev:electron  # dev mode with hot reload
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm run build         # production build
```

## Native module

The AEC module uses WebRTC's AEC3 via node-gyp:

```bash
cd native
npm install
npm run build  # builds audio_capture_native.node
```

Requires pre-built WebRTC libs in `native/webrtc/lib/`.

## License

MIT
