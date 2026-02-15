{
  "targets": [
    {
      "target_name": "audio_capture_native",
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "sources": [
        "native/src/audio_capture_native.cc",
        "native/src/aec_processor.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "native/webrtc/include"
      ],
      "libraries": [
        "<(module_root_dir)/native/webrtc/lib/libwebrtc.a"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "conditions": [
        [
          "OS=='mac'",
          {
            "xcode_settings": {
              "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
              "CLANG_CXX_LIBRARY": "libc++",
              "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
              "CLANG_ENABLE_OBJC_ARC": "YES",
              "MACOSX_DEPLOYMENT_TARGET": "10.15",
              "OTHER_CPLUSPLUSFLAGS": [
                "-stdlib=libc++",
                "-fvisibility=default",
                "-fobjc-arc"
              ],
              "OTHER_LDFLAGS": [
                "-stdlib=libc++"
              ]
            },
            "link_settings": {
              "libraries": [
                "-framework AudioToolbox",
                "-framework CoreAudio",
                "-framework CoreFoundation",
                "-framework Foundation",
                "-framework AVFoundation",
                "-framework CoreMedia",
                "-framework Accelerate"
              ]
            }
          }
        ],
        [
          "OS=='win'",
          {
            "msvs_settings": {
              "VCCLCompilerTool": {
                "ExceptionHandling": 1,
                "AdditionalOptions": ["/std:c++17"]
              }
            },
            "link_settings": {
              "libraries": [
                "-lole32.lib",
                "-loleaut32.lib",
                "-lwinmm.lib"
              ]
            }
          }
        ]
      ]
    }
  ]
}
