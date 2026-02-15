{
  "targets": [
    {
      "target_name": "audio_capture_native",
      "sources": [
        "src/audio_capture_native.cc",
        "src/aec_processor.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "webrtc/include"
      ],
      "libraries": [
        "../webrtc/lib/libwebrtc.a"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "12.0",
        "OTHER_CPLUSPLUSFLAGS": [
          "-std=c++17",
          "-stdlib=libc++"
        ],
        "OTHER_LDFLAGS": [
          "-framework AudioToolbox",
          "-framework CoreAudio",
          "-framework CoreFoundation"
        ]
      }
    }
  ]
}
