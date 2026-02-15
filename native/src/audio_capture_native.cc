#include <napi.h>
#include <AudioToolbox/AudioToolbox.h>
#include <CoreAudio/CoreAudio.h>
#include <mach/mach_time.h>
#include <dispatch/dispatch.h>
#include <chrono>
#include <iostream>
#include <vector>
#include <string>
#include "aec_processor.h"

using namespace kakarot;

class AudioCaptureAddon : public Napi::ObjectWrap<AudioCaptureAddon> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    AudioCaptureAddon(const Napi::CallbackInfo& info);
    ~AudioCaptureAddon();

private:
    // Native microphone capture methods
    Napi::Value StartMicrophoneCapture(const Napi::CallbackInfo& info);
    Napi::Value StopMicrophoneCapture(const Napi::CallbackInfo& info);
    Napi::Value GetDevices(const Napi::CallbackInfo& info);
    
    // AEC methods
    Napi::Value ProcessRenderAudio(const Napi::CallbackInfo& info);
    Napi::Value ProcessCaptureAudio(const Napi::CallbackInfo& info);
    Napi::Value GetMetrics(const Napi::CallbackInfo& info);
    Napi::Value SetEchoCancellationEnabled(const Napi::CallbackInfo& info);
    
    // Placeholder methods
    Napi::Value Start(const Napi::CallbackInfo& info);
    Napi::Value Stop(const Napi::CallbackInfo& info);
    
    // State
    AudioUnit mic_audio_unit_;
    AudioDeviceID device_id_;
    AudioDeviceIOProcID io_proc_id_;
    Napi::ThreadSafeFunction tsfn_;
    bool is_capturing_;
    bool tsfn_created_;
    std::string selected_device_id_;
    
    // AEC processor
    std::unique_ptr<AECProcessor> aec_processor_;
};

Napi::Object AudioCaptureAddon::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "AudioCaptureAddon", {
        InstanceMethod("startMicrophoneCapture", &AudioCaptureAddon::StartMicrophoneCapture),
        InstanceMethod("stopMicrophoneCapture", &AudioCaptureAddon::StopMicrophoneCapture),
        InstanceMethod("getDevices", &AudioCaptureAddon::GetDevices),
        InstanceMethod("processRenderAudio", &AudioCaptureAddon::ProcessRenderAudio),
        InstanceMethod("processCaptureAudio", &AudioCaptureAddon::ProcessCaptureAudio),
        InstanceMethod("getMetrics", &AudioCaptureAddon::GetMetrics),
        InstanceMethod("setEchoCancellationEnabled", &AudioCaptureAddon::SetEchoCancellationEnabled),
        InstanceMethod("start", &AudioCaptureAddon::Start),
        InstanceMethod("stop", &AudioCaptureAddon::Stop)
    });
    
    exports.Set("AudioCaptureAddon", func);
    return exports;
}

AudioCaptureAddon::AudioCaptureAddon(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<AudioCaptureAddon>(info),
      mic_audio_unit_(nullptr),
      device_id_(kAudioObjectUnknown),
      io_proc_id_(nullptr),
      is_capturing_(false),
      tsfn_created_(false) {
    
    std::cout << "✅ AudioCaptureAddon created" << std::endl;
    
    // Initialize AEC processor
    AECConfig config;
    config.enable_aec = true;
    config.enable_ns = true;
    config.enable_agc = true;  // ✅ Enable AGC for mic sensitivity
    config.frame_duration_ms = 10;
    
    try {
        aec_processor_ = std::make_unique<AECProcessor>(config);
        if (aec_processor_->Initialize(48000, 1)) {
            std::cout << "✅ AEC processor initialized" << std::endl;
        } else {
            std::cerr << "❌ Failed to initialize AEC processor" << std::endl;
            aec_processor_.reset();
        }
    } catch (const std::exception& e) {
        std::cerr << "❌ Exception initializing AEC: " << e.what() << std::endl;
        aec_processor_.reset();
    }
}

AudioCaptureAddon::~AudioCaptureAddon() {
    if (is_capturing_) {
        StopMicrophoneCapture(Napi::CallbackInfo(Env(), nullptr));
    }
    aec_processor_.reset();
}

Napi::Value AudioCaptureAddon::StartMicrophoneCapture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (is_capturing_) {
        return Napi::Boolean::New(env, false);
    }
    
    // Get callback function
    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::Error::New(env, "Callback function required").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    
    Napi::Function callback = info[0].As<Napi::Function>();
    
    // Create ThreadSafeFunction
    tsfn_ = Napi::ThreadSafeFunction::New(
        env,
        callback,
        "MicrophoneCapture",
        0,
        1);
    tsfn_created_ = true;

    std::cout << "🎤 Starting AUHAL microphone capture (Granola pattern)..." << std::endl;
    
    OSStatus status;
    
    // Get default input device
    AudioObjectPropertyAddress propertyAddress = {
        kAudioHardwarePropertyDefaultInputDevice,
        kAudioObjectPropertyScopeGlobal,
        kAudioObjectPropertyElementMain
    };
    
    UInt32 deviceSize = sizeof(device_id_);
    status = AudioObjectGetPropertyData(
        kAudioObjectSystemObject,
        &propertyAddress,
        0,
        nullptr,
        &deviceSize,
        &device_id_);
    
    if (status != noErr || device_id_ == kAudioObjectUnknown) {
        Napi::Error::New(env, "Failed to get default input device").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    
    // Get device name for logging
    CFStringRef deviceName = nullptr;
    AudioObjectPropertyAddress nameAddress = {
        kAudioDevicePropertyDeviceNameCFString,
        kAudioObjectPropertyScopeGlobal,
        kAudioObjectPropertyElementMain
    };
    
    UInt32 nameSize = sizeof(deviceName);
    status = AudioObjectGetPropertyData(device_id_, &nameAddress, 0, nullptr, &nameSize, &deviceName);
    
    if (status == noErr && deviceName) {
        char name[256];
        CFStringGetCString(deviceName, name, sizeof(name), kCFStringEncodingUTF8);
        std::cout << "✅ Using default input device: " << device_id_ << " (" << name << ")" << std::endl;
        CFRelease(deviceName);
    } else {
        std::cout << "✅ Using default input device: " << device_id_ << std::endl;
    }
    
    // STEP 1: Find HALOutput AudioComponent
    AudioComponentDescription desc;
    desc.componentType = kAudioUnitType_Output;
    desc.componentSubType = kAudioUnitSubType_HALOutput;
    desc.componentManufacturer = kAudioUnitManufacturer_Apple;
    desc.componentFlags = 0;
    desc.componentFlagsMask = 0;
    
    AudioComponent component = AudioComponentFindNext(nullptr, &desc);
    if (!component) {
        Napi::Error::New(env, "Failed to find HALOutput AudioComponent").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    std::cout << "✅ Step 1: Found HALOutput AudioComponent" << std::endl;
    
    // STEP 2: Create AudioUnit instance
    status = AudioComponentInstanceNew(component, &mic_audio_unit_);
    if (status != noErr) {
        Napi::Error::New(env, "Failed to create AudioUnit instance").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    std::cout << "✅ Step 2: Created AudioUnit instance" << std::endl;
    
    // STEP 3: Enable INPUT (bus 1), DISABLE OUTPUT (bus 0)
    UInt32 enableIO = 1;
    status = AudioUnitSetProperty(
        mic_audio_unit_,
        kAudioOutputUnitProperty_EnableIO,
        kAudioUnitScope_Input,
        1,
        &enableIO,
        sizeof(enableIO));
    
    if (status != noErr) {
        AudioComponentInstanceDispose(mic_audio_unit_);
        Napi::Error::New(env, "Failed to enable input").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    std::cout << "✅ Step 3: Enabled INPUT on bus 1" << std::endl;
    
    enableIO = 0;
    status = AudioUnitSetProperty(
        mic_audio_unit_,
        kAudioOutputUnitProperty_EnableIO,
        kAudioUnitScope_Output,
        0,
        &enableIO,
        sizeof(enableIO));
    
    if (status != noErr) {
        AudioComponentInstanceDispose(mic_audio_unit_);
        Napi::Error::New(env, "Failed to disable output").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    std::cout << "✅ Step 4: Disabled OUTPUT on bus 0" << std::endl;
    
    // STEP 5: Set input device
    status = AudioUnitSetProperty(
        mic_audio_unit_,
        kAudioOutputUnitProperty_CurrentDevice,
        kAudioUnitScope_Global,
        0,
        &device_id_,
        sizeof(device_id_));
    
    if (status != noErr) {
        AudioComponentInstanceDispose(mic_audio_unit_);
        std::cerr << "❌ Failed to set input device, error: " << status << std::endl;
        Napi::Error::New(env, "Failed to set input device").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    std::cout << "✅ Step 5: Set device to " << device_id_ << std::endl;
    
    // STEP 6: Set format on INPUT bus
    AudioStreamBasicDescription format;
    format.mSampleRate = 48000.0;
    format.mFormatID = kAudioFormatLinearPCM;
    format.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked | kAudioFormatFlagIsNonInterleaved;
    format.mBytesPerPacket = sizeof(float);
    format.mFramesPerPacket = 1;
    format.mBytesPerFrame = sizeof(float);
    format.mChannelsPerFrame = 1;
    format.mBitsPerChannel = 32;
    format.mReserved = 0;
    
    status = AudioUnitSetProperty(
        mic_audio_unit_,
        kAudioUnitProperty_StreamFormat,
        kAudioUnitScope_Output,
        1,
        &format,
        sizeof(format));
    
    if (status != noErr) {
        AudioComponentInstanceDispose(mic_audio_unit_);
        Napi::Error::New(env, "Failed to set stream format").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    std::cout << "✅ Step 6: Set Float32 48kHz format on INPUT bus" << std::endl;
    
    // STEP 7: Initialize AudioUnit
    status = AudioUnitInitialize(mic_audio_unit_);
    if (status != noErr) {
        AudioComponentInstanceDispose(mic_audio_unit_);
        std::cerr << "❌ Failed to initialize AudioUnit, error: " << status << std::endl;
        Napi::Error::New(env, "Failed to initialize AudioUnit").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    std::cout << "✅ Step 7: AudioUnit initialized" << std::endl;
    
    // STEP 8: Create HAL-level IOProc callback - FIXED VERSION
    status = AudioDeviceCreateIOProcID(
        device_id_,
        [](AudioDeviceID inDevice,
           const AudioTimeStamp* inNow,
           const AudioBufferList* inInputData,
           const AudioTimeStamp* inInputTime,
           AudioBufferList* outOutputData,
           const AudioTimeStamp* inOutputTime,
           void* inClientData) -> OSStatus {
            
            AudioCaptureAddon* self = static_cast<AudioCaptureAddon*>(inClientData);
            
            // Safety checks
            if (!self || !self->is_capturing_ || !self->tsfn_created_ || !inInputData || inInputData->mNumberBuffers == 0) {
                return noErr;
            }
            
            try {
                // Extract audio data from first buffer
                AudioBuffer buffer = inInputData->mBuffers[0];
                if (!buffer.mData || buffer.mDataByteSize == 0) {
                    return noErr;
                }
                
                float* audioData = (float*)buffer.mData;
                UInt32 numSamples = buffer.mDataByteSize / sizeof(float);
                
                // Sanity check
                if (numSamples == 0 || numSamples > 48000) {
                    return noErr;
                }
                
                // Get timestamp in milliseconds since Unix epoch (matching Date.now() in JavaScript)
                auto now = std::chrono::system_clock::now();
                auto ms_since_epoch = std::chrono::duration_cast<std::chrono::milliseconds>(
                    now.time_since_epoch()
                ).count();
                double timestamp_ms = static_cast<double>(ms_since_epoch);
                
                // Copy to vector
                std::vector<float>* samples = new std::vector<float>(audioData, audioData + numSamples);
                
                // Send to JavaScript
                struct CallbackData {
                    std::vector<float>* samples;
                    double timestamp;
                };
                
                CallbackData* data = new CallbackData{samples, timestamp_ms};
                
                napi_status napistatus = self->tsfn_.NonBlockingCall(data, [](Napi::Env env, Napi::Function jsCallback, CallbackData* data) {
                    try {
                        // Create Float32Array with the audio samples
                        Napi::Float32Array samplesArray = Napi::Float32Array::New(env, data->samples->size());
                        memcpy(samplesArray.Data(), data->samples->data(), data->samples->size() * sizeof(float));
                        
                        // THE FIX: Call JavaScript callback with (samples, timestamp) as separate parameters
                        jsCallback.Call({
                            samplesArray,
                            Napi::Number::New(env, data->timestamp)
                        });
                    } catch (...) {
                        // Silently catch to prevent crash
                    }
                    
                    delete data->samples;
                    delete data;
                });
                
                if (napistatus != napi_ok) {
                    delete samples;
                    delete data;
                }
            } catch (...) {
                // Catch all exceptions
            }
            
            return noErr;
        },
        this,
        &io_proc_id_);
    
    if (status != noErr) {
        AudioUnitUninitialize(mic_audio_unit_);
        AudioComponentInstanceDispose(mic_audio_unit_);
        std::cerr << "❌ Failed to create IOProc, error: " << status << std::endl;
        Napi::Error::New(env, "Failed to create IOProc").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    std::cout << "✅ Step 8: Created HAL IOProc callback" << std::endl;
    
    // STEP 9: Start audio device
    status = AudioDeviceStart(device_id_, io_proc_id_);
    if (status != noErr) {
        AudioDeviceDestroyIOProcID(device_id_, io_proc_id_);
        AudioUnitUninitialize(mic_audio_unit_);
        AudioComponentInstanceDispose(mic_audio_unit_);
        std::cerr << "❌ Failed to start AudioDevice, error: " << status << std::endl;
        Napi::Error::New(env, "Failed to start AudioDevice").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    std::cout << "✅ Step 9: AudioDevice started!" << std::endl;
    
    is_capturing_ = true;
    std::cout << "🎉 MIC CAPTURE FULLY STARTED (Granola pattern)! HAL IOProc will deliver audio." << std::endl;
    
    return Napi::Boolean::New(env, true);
}

Napi::Value AudioCaptureAddon::StopMicrophoneCapture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!is_capturing_) {
        return Napi::Boolean::New(env, false);
    }
    
    std::cout << "🛑 Stopping microphone capture..." << std::endl;
    
    is_capturing_ = false;
    
    // Stop and cleanup in reverse order
    if (device_id_ != kAudioObjectUnknown && io_proc_id_ != nullptr) {
        AudioDeviceStop(device_id_, io_proc_id_);
        AudioDeviceDestroyIOProcID(device_id_, io_proc_id_);
        io_proc_id_ = nullptr;
    }
    
    if (mic_audio_unit_) {
        AudioUnitUninitialize(mic_audio_unit_);
        AudioComponentInstanceDispose(mic_audio_unit_);
        mic_audio_unit_ = nullptr;
    }
    
    if (tsfn_created_) {
        tsfn_.Release();
        tsfn_created_ = false;
    }
    
    std::cout << "✅ Microphone capture stopped" << std::endl;
    
    return Napi::Boolean::New(env, true);
}

// AEC METHODS - THE MISSING PIECE!

Napi::Value AudioCaptureAddon::ProcessRenderAudio(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!aec_processor_) {
        return env.Undefined();
    }
    
    if (info.Length() < 1 || !info[0].IsTypedArray()) {
        Napi::TypeError::New(env, "Expected Float32Array").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    Napi::Float32Array input = info[0].As<Napi::Float32Array>();
    
    try {
        aec_processor_->ProcessRenderAudio(input.Data(), input.ElementLength());
    } catch (const std::exception& e) {
        std::cerr << "❌ ProcessRenderAudio error: " << e.what() << std::endl;
    }
    
    return env.Undefined();
}

Napi::Value AudioCaptureAddon::ProcessCaptureAudio(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!aec_processor_) {
        return env.Null();
    }
    
    if (info.Length() < 1 || !info[0].IsTypedArray()) {
        Napi::TypeError::New(env, "Expected Float32Array").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    Napi::Float32Array input = info[0].As<Napi::Float32Array>();
    Napi::Float32Array output = Napi::Float32Array::New(env, input.ElementLength());
    
    try {
        aec_processor_->ProcessCaptureAudio(input.Data(), output.Data(), input.ElementLength());
    } catch (const std::exception& e) {
        std::cerr << "❌ ProcessCaptureAudio error: " << e.what() << std::endl;
        return env.Null();
    }
    
    return output;
}

Napi::Value AudioCaptureAddon::GetMetrics(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!aec_processor_) {
        return env.Null();
    }
    
    try {
        AECMetrics metrics = aec_processor_->GetMetrics();
        
        Napi::Object result = Napi::Object::New(env);
        result.Set("echoReturnLoss", metrics.echo_return_loss);
        result.Set("echoReturnLossEnhancement", metrics.echo_return_loss_enhancement);
        result.Set("renderDelayMs", metrics.render_delay_ms);
        result.Set("aecConverged", metrics.aec_converged);
        result.Set("rmsLevel", metrics.rms_level);
        result.Set("peakLevel", metrics.peak_level);
        
        return result;
    } catch (const std::exception& e) {
        std::cerr << "❌ GetMetrics error: " << e.what() << std::endl;
        return env.Null();
    }
}

Napi::Value AudioCaptureAddon::SetEchoCancellationEnabled(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!aec_processor_) {
        return env.Undefined();
    }
    
    if (info.Length() < 1 || !info[0].IsBoolean()) {
        Napi::TypeError::New(env, "Expected boolean").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    bool enabled = info[0].As<Napi::Boolean>().Value();
    
    try {
        aec_processor_->SetEchoCancellationEnabled(enabled);
    } catch (const std::exception& e) {
        std::cerr << "❌ SetEchoCancellationEnabled error: " << e.what() << std::endl;
    }
    
    return env.Undefined();
}

Napi::Value AudioCaptureAddon::GetDevices(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Array devices = Napi::Array::New(env);
    
    AudioObjectPropertyAddress propertyAddress = {
        kAudioHardwarePropertyDevices,
        kAudioObjectPropertyScopeGlobal,
        kAudioObjectPropertyElementMain
    };
    
    UInt32 dataSize = 0;
    OSStatus status = AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &propertyAddress, 0, nullptr, &dataSize);
    if (status != noErr) {
        return devices;
    }
    
    UInt32 deviceCount = dataSize / sizeof(AudioDeviceID);
    AudioDeviceID* audioDevices = (AudioDeviceID*)malloc(dataSize);
    
    status = AudioObjectGetPropertyData(kAudioObjectSystemObject, &propertyAddress, 0, nullptr, &dataSize, audioDevices);
    if (status != noErr) {
        free(audioDevices);
        return devices;
    }
    
    uint32_t deviceIndex = 0;
    for (UInt32 i = 0; i < deviceCount; i++) {
        AudioDeviceID deviceID = audioDevices[i];
        
        // Check if device has input
        AudioObjectPropertyAddress inputAddress = {
            kAudioDevicePropertyStreamConfiguration,
            kAudioDevicePropertyScopeInput,
            kAudioObjectPropertyElementMain
        };
        
        status = AudioObjectGetPropertyDataSize(deviceID, &inputAddress, 0, nullptr, &dataSize);
        if (status != noErr) continue;
        
        AudioBufferList* bufferList = (AudioBufferList*)malloc(dataSize);
        status = AudioObjectGetPropertyData(deviceID, &inputAddress, 0, nullptr, &dataSize, bufferList);
        
        if (status == noErr && bufferList->mNumberBuffers > 0) {
            // Get device name
            CFStringRef deviceName = nullptr;
            AudioObjectPropertyAddress nameAddress = {
                kAudioDevicePropertyDeviceNameCFString,
                kAudioObjectPropertyScopeGlobal,
                kAudioObjectPropertyElementMain
            };
            
            dataSize = sizeof(deviceName);
            status = AudioObjectGetPropertyData(deviceID, &nameAddress, 0, nullptr, &dataSize, &deviceName);
            
            if (status == noErr && deviceName) {
                char name[256];
                CFStringGetCString(deviceName, name, sizeof(name), kCFStringEncodingUTF8);
                CFRelease(deviceName);
                
                Napi::Object device = Napi::Object::New(env);
                device.Set("id", std::to_string(deviceID));
                device.Set("name", name);
                device.Set("isDefault", false);
                
                devices.Set(deviceIndex++, device);
            }
        }
        
        free(bufferList);
    }
    
    free(audioDevices);
    return devices;
}

Napi::Value AudioCaptureAddon::Start(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), true);
}

Napi::Value AudioCaptureAddon::Stop(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), true);
}

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    return AudioCaptureAddon::Init(env, exports);
}

NODE_API_MODULE(audio_capture_native, InitAll)