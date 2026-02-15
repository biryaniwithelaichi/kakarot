#!/bin/bash
set -e

echo "🎛️ Setting up WebRTC library for AEC3..."

# Create directories
mkdir -p native/webrtc/lib
mkdir -p native/webrtc/include

cd native/webrtc

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    WEBRTC_ARCH="arm64"
else
    WEBRTC_ARCH="x64"
fi

echo "Detected architecture: $WEBRTC_ARCH"

# Download from shiguredo WebRTC build (most reliable prebuilt binaries for macOS)
echo "📥 Downloading prebuilt WebRTC library..."

# shiguredo provides reliable prebuilt WebRTC binaries
# Check releases at: https://github.com/shiguredo-webrtc-build/webrtc-build/releases
SHIGUREDO_VERSION="m125.6422.2.0"

if [ "$WEBRTC_ARCH" = "arm64" ]; then
    WEBRTC_URL="https://github.com/aspect-build/aspect-webrtc-build/releases/download/aspect-m125/aspect-webrtc-macos_arm64.tar.xz"
else
    WEBRTC_URL="https://github.com/aspect-build/aspect-webrtc-build/releases/download/aspect-m125/aspect-webrtc-macos_x86_64.tar.xz"
fi

echo "Attempting download from: $WEBRTC_URL"

if curl -L --fail "${WEBRTC_URL}" -o webrtc.tar.xz 2>/dev/null; then
    echo "✅ Downloaded from aspect-build"
    tar -xJf webrtc.tar.xz
    rm -f webrtc.tar.xz
else
    # Try shiguredo directly
    if [ "$WEBRTC_ARCH" = "arm64" ]; then
        WEBRTC_URL="https://github.com/aspect-build/aspect-webrtc-build/releases/download/aspect-m131/aspect-webrtc-macos_arm64.tar.xz"
    else  
        WEBRTC_URL="https://github.com/aspect-build/aspect-webrtc-build/releases/download/aspect-m131/aspect-webrtc-macos_x86_64.tar.xz"
    fi
    echo "Trying alternative URL: $WEBRTC_URL"
    
    if curl -L --fail "${WEBRTC_URL}" -o webrtc.tar.xz 2>/dev/null; then
        echo "✅ Downloaded from alternative source"
        tar -xJf webrtc.tar.xz
        rm -f webrtc.tar.xz
    else
        echo "⚠️ Automatic download failed."
        echo ""
        echo "📋 MANUAL INSTALLATION REQUIRED:"
        echo ""
        echo "Option 1: Download prebuilt WebRTC from one of these sources:"
        echo "  - https://github.com/aspect-build/aspect-webrtc-build/releases"
        echo "  - https://github.com/aspect-build/aspect-aspect-build/aspect-webrtc-m125.tar.gz"
        echo "  - https://chromiumdash.appspot.com/releases (official builds)"
        echo ""
        echo "Option 2: Build WebRTC from source:"
        echo "  git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git"
        echo "  export PATH=\$PATH:\$(pwd)/depot_tools"
        echo "  mkdir webrtc-checkout && cd webrtc-checkout"
        echo "  fetch --nohooks webrtc"
        echo "  cd src"
        echo "  git checkout branch-heads/6099  # M120"
        echo "  gclient sync"
        echo "  gn gen out/Release --args='is_debug=false rtc_include_tests=false'"
        echo "  ninja -C out/Release"
        echo ""
        echo "After obtaining the library, place files as follows:"
        echo "  native/webrtc/lib/libwebrtc.a"
        echo "  native/webrtc/include/modules/audio_processing/aec3/echo_canceller3.h"
        echo ""
        exit 1
    fi
fi

# Move files to correct locations (structure varies by source)
if [ -d "aspect-webrtc" ]; then
    # aspect-build structure
    if [ -d "aspect-webrtc/lib" ]; then
        cp -r aspect-webrtc/lib/* lib/ 2>/dev/null || true
    fi
    if [ -d "aspect-webrtc/include" ]; then
        cp -r aspect-webrtc/include/* include/ 2>/dev/null || true
    fi
    rm -rf aspect-webrtc
elif [ -d "webrtc" ]; then
    # shiguredo structure
    if [ -d "webrtc/lib" ]; then
        cp -r webrtc/lib/* lib/ 2>/dev/null || true
    fi
    if [ -d "webrtc/include" ]; then
        cp -r webrtc/include/* include/ 2>/dev/null || true
    fi
    rm -rf webrtc
else
    # Try to find libwebrtc.a anywhere in extracted content
    find . -name "libwebrtc.a" -exec cp {} lib/ \; 2>/dev/null || true
    # Copy all headers maintaining directory structure
    if [ -d "include" ]; then
        echo "Headers already in place"
    else
        find . -type d -name "include" -exec cp -r {}/* include/ \; 2>/dev/null || true
    fi
fi

# Cleanup
rm -f webrtc.tar.gz webrtc.tar.xz

# Verify installation
echo ""
echo "🔍 Verifying installation..."

if [ -f "lib/libwebrtc.a" ]; then
    echo "✅ libwebrtc.a found"
    ls -lh lib/libwebrtc.a
else
    echo "❌ libwebrtc.a NOT FOUND"
    echo "Please manually download and place in native/webrtc/lib/"
    exit 1
fi

if [ -f "include/modules/audio_processing/aec3/echo_canceller3.h" ]; then
    echo "✅ AEC3 headers found"
else
    echo "⚠️ AEC3 headers not found at expected location"
    echo "Looking for alternative header locations..."
    find include -name "echo_canceller*.h" 2>/dev/null || echo "No AEC headers found"
    echo ""
    echo "You may need to manually extract headers from WebRTC source"
fi

echo ""
echo "🎉 WebRTC setup complete!"
echo ""
echo "Next steps:"
echo "  npm run build:native"
