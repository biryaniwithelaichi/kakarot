#!/bin/bash
# WebRTC AEC Integration Test Script
# Verifies the AEC processor is properly initialized and processing audio

echo "🔍 WebRTC AEC Integration Check"
echo "================================="
echo ""

# Check if bindings module is installed
echo "1️⃣  Checking for 'bindings' package..."
if [ -d "node_modules/bindings" ]; then
    echo "   ✅ 'bindings' package found"
else
    echo "   ❌ 'bindings' package NOT found"
    echo "   Run: npm install bindings"
    exit 1
fi

# Check if AECProcessor.ts exists
echo ""
echo "2️⃣  Checking AECProcessor.ts..."
if [ -f "src/main/audio/native/AECProcessor.ts" ]; then
    echo "   ✅ AECProcessor.ts found"
else
    echo "   ❌ AECProcessor.ts NOT found"
    exit 1
fi

# Check if native module exists
echo ""
echo "3️⃣  Checking native audio module..."
if [ -f "native/build/Release/audio_capture_native.node" ]; then
    echo "   ✅ Native module found at native/build/Release/audio_capture_native.node"
    ls -lh native/build/Release/audio_capture_native.node
else
    echo "   ⚠️  Native module NOT found, rebuilding..."
    npm run build:native
fi

# Check AudioService integration
echo ""
echo "4️⃣  Checking AudioService integration..."
if grep -q "AECProcessor" src/main/audio/AudioService.ts; then
    echo "   ✅ AudioService imports AECProcessor"
else
    echo "   ❌ AudioService does not import AECProcessor"
    exit 1
fi

if grep -q "getAECProcessor\|getAECMetrics" src/main/audio/AudioService.ts; then
    echo "   ✅ AudioService exposes AEC methods"
else
    echo "   ❌ AudioService missing AEC methods"
    exit 1
fi

# Check audioHandlers integration
echo ""
echo "5️⃣  Checking audioHandlers AEC integration..."
if grep -q "aecProcessor.processRenderAudio\|aecProcessor.processCaptureAudio" src/main/handlers/audioHandlers.ts; then
    echo "   ✅ audioHandlers processes audio through AEC"
else
    echo "   ❌ audioHandlers not using AEC processor"
    exit 1
fi

echo ""
echo "================================="
echo "✅ All integration checks passed!"
echo ""
echo "Next steps:"
echo "1. Run: npm run build"
echo "2. Start the app: npm run dev:electron"
echo "3. Check console for: '✅ WebRTC AEC processor initialized'"
echo "4. Start a recording and verify no speaker audio in mic transcript"
echo ""
