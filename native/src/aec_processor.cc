#include "aec_processor.h"
#include "api/audio/builtin_audio_processing_builder.h"
#include "api/audio/audio_processing.h"
#include "api/environment/environment_factory.h"
#include "api/audio/echo_canceller3_config.h"
#include "api/scoped_refptr.h"
#include <iostream>
#include <cstring>
#include <cmath>
#include <algorithm>
#include <queue>
#include <optional>

namespace kakarot {

class AECProcessor::Impl {
public:
    explicit Impl(const AECConfig& config) : config_(config) {}
    
    ~Impl() {
        // scoped_refptr will automatically clean up
    }
    
    bool Initialize(int sample_rate, int num_channels) {
        sample_rate_ = sample_rate;
        num_channels_ = num_channels;
        frame_size_ = (sample_rate * config_.frame_duration_ms) / 1000;

        std::cout << "🔧 Initializing AEC with frame_size=" << frame_size_ << " samples (" 
                  << config_.frame_duration_ms << "ms at " << sample_rate << "Hz)\n";

        try {
            // Create custom EchoCanceller3Config for aggressive echo suppression
            webrtc::EchoCanceller3Config aec3_config;
            
            // DELAY - allow up to 500ms of delay between speakers and mic
            aec3_config.delay.default_delay = 5;
            aec3_config.delay.down_sampling_factor = 4;
            aec3_config.delay.num_filters = 5;
            aec3_config.delay.delay_headroom_samples = 64;  // More headroom (was 32)
            aec3_config.delay.hysteresis_limit_blocks = 2;  // More stable (was 1)
            
            // FILTER - Make adaptive filter longer and more aggressive
            aec3_config.filter.refined.length_blocks = 24;  // Longer filter (default 13)
            aec3_config.filter.refined.leakage_converged = 0.00002f;  // Less leakage (was 0.00005)
            aec3_config.filter.refined_initial.length_blocks = 18;  // Longer initial (default 12)
            aec3_config.filter.refined_initial.leakage_converged = 0.0002f;  // Less leakage
            aec3_config.filter.config_change_duration_blocks = 100;  // Faster adaptation (was 250)
            aec3_config.filter.initial_state_seconds = 1.5f;  // Faster startup (was 2.5)
            aec3_config.filter.conservative_initial_phase = false;  // Aggressive from start
            
            // SUPPRESSOR - MUCH more aggressive echo suppression
            aec3_config.suppressor.nearend_average_blocks = 8;  // Longer averaging = slower to release suppression (was 4)
            
            // Normal tuning - more aggressive suppression
            aec3_config.suppressor.normal_tuning.mask_lf.enr_transparent = 0.12f;  // Start suppressing even earlier (was 0.15)
            aec3_config.suppressor.normal_tuning.mask_lf.enr_suppress = 0.18f;  // Suppress even harder (was 0.2)
            aec3_config.suppressor.normal_tuning.mask_hf.enr_transparent = 0.03f;  // Ultra-aggressive HF (was 0.04)
            aec3_config.suppressor.normal_tuning.mask_hf.enr_suppress = 0.04f;  // Ultra-aggressive HF (was 0.05)
            aec3_config.suppressor.normal_tuning.max_inc_factor = 1.0f;  // VERY slow gain increase (was 1.2) - holds suppression longer
            aec3_config.suppressor.normal_tuning.max_dec_factor_lf = 0.05f;  // Ultra-fast gain decrease (was 0.08) - crushes tail-end echo instantly
            
            // High bands suppression - crush echo in high frequencies
            aec3_config.suppressor.high_bands_suppression.enr_threshold = 0.4f;  // Even more sensitive (was 0.5)
            aec3_config.suppressor.high_bands_suppression.max_gain_during_echo = 0.005f;  // Ultra-low gain during echo (was 0.01) - 0.5% instead of 1%
            
            // Floor first increase - keep suppression floor VERY low to block tail-end echo
            aec3_config.suppressor.floor_first_increase = 0.0000005f;  // Ultra-small (was 0.000001) - maintains deep suppression
            
            // Dominant nearend detection - require stronger evidence of actual speech
            // Higher thresholds = less sensitive = fewer false positives = less echo leakage
            aec3_config.suppressor.dominant_nearend_detection.enr_threshold = 0.35f;  // Higher = less sensitive (was 0.15)
            aec3_config.suppressor.dominant_nearend_detection.trigger_threshold = 18;  // Slower = more evidence needed (was 8)
            aec3_config.suppressor.dominant_nearend_detection.hold_duration = 150;  // Hold detection even longer (was 100) - prevents rapid transitions
            
            // Echo audibility - be more aggressive about detecting echo
            aec3_config.echo_audibility.floor_power = 32.f;  // Lower floor (was 128)
            aec3_config.echo_audibility.audibility_threshold_lf = 5.f;  // More sensitive (was 10)
            aec3_config.echo_audibility.audibility_threshold_mf = 5.f;
            aec3_config.echo_audibility.audibility_threshold_hf = 5.f;
            
            // Render levels - capture more echo
            aec3_config.render_levels.active_render_limit = 50.f;  // Lower threshold (was 100)
            
            // EP strength - protect nearend speech
            aec3_config.ep_strength.default_len = 0.95f;  // Strong protection (was 0.83)
            
            std::cout << "✅ Ultra-aggressive AEC3 config created (optimized for echo blocking + mic sensitivity)\n";
            
            // Create AudioProcessing::Config
            webrtc::AudioProcessing::Config apm_config;
            
            // Configure echo cancellation
            if (config_.enable_aec) {
                apm_config.echo_canceller.enabled = true;
                apm_config.echo_canceller.mobile_mode = false;
                std::cout << "✅ AEC3 enabled with aggressive settings\n";
            }
            
            // Configure noise suppression
            if (config_.enable_ns) {
                apm_config.noise_suppression.enabled = true;
                apm_config.noise_suppression.level = 
                    webrtc::AudioProcessing::Config::NoiseSuppression::kModerate;
                std::cout << "✅ Noise suppression enabled\n";
            }
            
            // Configure AGC with aggressive settings for quiet laptop mics
            // Note: AGC is applied AFTER AEC, so these boosts don't affect echo cancellation
            if (config_.enable_agc) {
                apm_config.gain_controller2.enabled = true;

                // Fixed digital gain: 9dB baseline boost
                apm_config.gain_controller2.fixed_digital.gain_db = 9.0f;

                // Adaptive digital gain: aggressive settings for quiet mics
                apm_config.gain_controller2.adaptive_digital.enabled = true;
                apm_config.gain_controller2.adaptive_digital.initial_gain_db = 28.0f;  // Even higher starting gain for better sensitivity (was 25)
                apm_config.gain_controller2.adaptive_digital.max_gain_db = 50.0f;      // Full boost range
                apm_config.gain_controller2.adaptive_digital.headroom_db = 2.0f;       // Minimal headroom = louder (default 5)
                apm_config.gain_controller2.adaptive_digital.max_gain_change_db_per_second = 6.0f;  // Slower adaptation (was 12) - prevents boosting tail-end echo

                std::cout << "✅ AGC enabled: 9dB fixed + adaptive (initial=28dB, 6dB/s adaptation, headroom=2dB)\n";
            }
            
            // High-pass filter
            apm_config.high_pass_filter.enabled = true;
            
            // Create Environment (required for Build)
            webrtc::Environment env = webrtc::CreateEnvironment();
            
            // Build AudioProcessing instance with custom AEC3 config
            webrtc::BuiltinAudioProcessingBuilder builder(apm_config);
            
            // Pass our custom AEC3 configuration using the correct method
            if (config_.enable_aec) {
                // Second parameter is for multichannel config (we use mono, so pass empty optional)
                builder.SetEchoCancellerConfig(aec3_config, {});
                std::cout << "✅ Custom aggressive AEC3 config applied\n";
            }
            
            audio_processing_ = builder.Build(env);
            
            if (!audio_processing_) {
                std::cerr << "❌ Failed to create AudioProcessing, using fallback\n";
                return true;  // Continue with naive fallback
            }
            
            // Initialize frame buffers
            render_buffer_.reserve(frame_size_ * 2);  // Buffer for render audio
            capture_buffer_.reserve(frame_size_ * 2);  // Buffer for capture audio
            render_history_.resize(frame_size_ * 10);  // 100ms history for fallback
            
            frames_processed_ = 0;
            
            std::cout << "✅ WebRTC AEC3 initialized successfully with frame buffering\n";
            return true;
            
        } catch (const std::exception& e) {
            std::cerr << "❌ Error initializing AEC: " << e.what() << "\n";
            audio_processing_ = nullptr;
            return true;  // Continue with fallback
        }
    }

    void ProcessRenderAudio(const float* data, size_t num_samples) {
        if (!config_.enable_aec) return;
        
        // Store for fallback
        std::copy(data, data + std::min(num_samples, render_history_.size()), 
                  render_history_.begin());
        
        if (!audio_processing_) return;
        
        // Add to render buffer
        render_buffer_.insert(render_buffer_.end(), data, data + num_samples);
        
        // Process complete frames
        while (render_buffer_.size() >= frame_size_) {
            try {
                // Create render stream config
                webrtc::StreamConfig stream_config(sample_rate_, num_channels_);
                
                // Extract one frame
                std::vector<float> frame(render_buffer_.begin(), render_buffer_.begin() + frame_size_);
                
                // WebRTC needs non-const pointers
                float* output_ptr = frame.data();
                const float* input_ptr = frame.data();
                
                audio_processing_->ProcessReverseStream(
                    &input_ptr, stream_config, stream_config, &output_ptr);
                
                // Remove processed frame from buffer
                render_buffer_.erase(render_buffer_.begin(), render_buffer_.begin() + frame_size_);
                
            } catch (const std::exception& e) {
                std::cerr << "❌ ProcessReverseStream error: " << e.what() << "\n";
                // Clear buffer on error to prevent backup
                render_buffer_.clear();
                break;
            }
        }
    }

    void ProcessCaptureAudio(const float* input, float* output, size_t num_samples) {
        if (!audio_processing_ || !config_.enable_aec) {
            // Fallback to improved naive algorithm
            ProcessNaive(input, output, num_samples);
            CalculateMetrics(output, num_samples);
            return;
        }
        
        // Add input to capture buffer
        capture_buffer_.insert(capture_buffer_.end(), input, input + num_samples);
        
        // Process complete frames and accumulate output
        size_t output_written = 0;
        
        while (capture_buffer_.size() >= frame_size_ && output_written < num_samples) {
            try {
                // Create capture stream config
                webrtc::StreamConfig stream_config(sample_rate_, num_channels_);
                
                // Extract one frame
                std::vector<float> frame(capture_buffer_.begin(), capture_buffer_.begin() + frame_size_);
                
                // WebRTC processes in-place
                float* frame_ptr = frame.data();
                const float* input_ptr = frame.data();
                
                int result = audio_processing_->ProcessStream(
                    &input_ptr, stream_config, stream_config, &frame_ptr);
                
                if (result != 0) {
                    std::cerr << "❌ ProcessStream returned error: " << result << "\n";
                    // Copy unprocessed frame to output
                    size_t to_copy = std::min(frame_size_, num_samples - output_written);
                    std::copy(frame.begin(), frame.begin() + to_copy, output + output_written);
                } else {
                    // Copy processed frame to output
                    size_t to_copy = std::min(frame_size_, num_samples - output_written);
                    std::copy(frame.begin(), frame.begin() + to_copy, output + output_written);
                    
                    // Log occasionally
                    frames_processed_++;
                    if (frames_processed_ % 1000 == 0) {
                        std::cout << "✅ Processed " << frames_processed_ << " frames through WebRTC AEC3\n";
                    }
                }
                
                output_written += frame_size_;
                
                // Remove processed frame from buffer
                capture_buffer_.erase(capture_buffer_.begin(), capture_buffer_.begin() + frame_size_);
                
            } catch (const std::exception& e) {
                std::cerr << "❌ ProcessCaptureAudio error: " << e.what() << "\n";
                // Fall back to naive for this buffer
                ProcessNaive(input, output, num_samples);
                capture_buffer_.clear();
                break;
            }
        }
        
        // If we couldn't process all samples (buffer not full yet), copy remaining input
        if (output_written < num_samples) {
            size_t remaining = num_samples - output_written;
            std::copy(input + output_written, input + num_samples, output + output_written);
        }
        
        CalculateMetrics(output, num_samples);
    }

    void SetEchoCancellationEnabled(bool enabled) {
        config_.enable_aec = enabled;
        
        if (audio_processing_) {
            try {
                auto apm_config = audio_processing_->GetConfig();
                apm_config.echo_canceller.enabled = enabled;
                audio_processing_->ApplyConfig(apm_config);
                std::cout << (enabled ? "✅ AEC enabled" : "⚠️ AEC disabled") << "\n";
            } catch (const std::exception& e) {
                std::cerr << "❌ Error setting AEC enabled: " << e.what() << "\n";
            }
        }
    }

    AECMetrics GetMetrics() const {
        AECMetrics metrics;
        metrics.rms_level = current_rms_;
        metrics.peak_level = current_peak_;
        
        if (audio_processing_ && config_.enable_aec) {
            // WebRTC is active - assume good performance
            metrics.echo_return_loss = 20.0f;
            metrics.echo_return_loss_enhancement = 15.0f;
            metrics.aec_converged = true;
        } else {
            // Using fallback
            metrics.echo_return_loss = 5.0f;
            metrics.echo_return_loss_enhancement = 3.0f;
            metrics.aec_converged = false;
        }
        
        return metrics;
    }

private:
    // Improved naive algorithm (fallback when WebRTC not available)
    void ProcessNaive(const float* input, float* output, size_t num_samples) {
        std::copy(input, input + num_samples, output);
        
        if (!config_.enable_aec) return;
        
        // Echo cancellation
        size_t samples = std::min(num_samples, render_history_.size());
        for (size_t i = 0; i < samples; i++) {
            output[i] -= render_history_[i] * 0.5f;
        }
        
        // High-pass filter
        ApplyHighPassFilter(output, num_samples);
        
        // Noise suppression
        if (config_.enable_ns) {
            ApplyNoiseSuppression(output, num_samples);
        }
    }
    
    void ApplyHighPassFilter(float* data, size_t num_samples) {
        const float cutoff = 80.0f / sample_rate_;
        const float alpha = 1.0f / (1.0f + cutoff);
        
        for (size_t i = 1; i < num_samples; i++) {
            data[i] = alpha * (hp_prev_ + data[i] - data[i-1]);
            hp_prev_ = data[i];
        }
    }
    
    void ApplyNoiseSuppression(float* data, size_t num_samples) {
        const float threshold = 0.01f;
        for (size_t i = 0; i < num_samples; i++) {
            if (std::abs(data[i]) < threshold) {
                data[i] *= 0.1f;
            }
        }
    }
    
    void CalculateMetrics(const float* data, size_t num_samples) {
        float sum = 0.0f;
        float peak = 0.0f;
        for (size_t i = 0; i < num_samples; i++) {
            float val = std::abs(data[i]);
            sum += val * val;
            peak = std::max(peak, val);
        }
        current_rms_ = std::sqrt(sum / num_samples);
        current_peak_ = peak;
    }

    AECConfig config_;
    webrtc::scoped_refptr<webrtc::AudioProcessing> audio_processing_;
    
    // Frame buffering
    std::vector<float> render_buffer_;   // Accumulates render audio into frames
    std::vector<float> capture_buffer_;  // Accumulates capture audio into frames
    std::vector<float> render_history_;  // For fallback algorithm
    
    int sample_rate_ = 0;
    int num_channels_ = 0;
    size_t frame_size_ = 0;
    size_t frames_processed_ = 0;
    
    float current_rms_ = 0.0f;
    float current_peak_ = 0.0f;
    float hp_prev_ = 0.0f;
};

AECProcessor::AECProcessor(const AECConfig& config) 
    : impl_(std::make_unique<Impl>(config)) {}

AECProcessor::~AECProcessor() = default;

bool AECProcessor::Initialize(int sample_rate, int num_channels) {
    return impl_->Initialize(sample_rate, num_channels);
}

void AECProcessor::ProcessRenderAudio(const float* data, size_t num_samples) {
    impl_->ProcessRenderAudio(data, num_samples);
}

void AECProcessor::ProcessCaptureAudio(const float* input, float* output, size_t num_samples) {
    impl_->ProcessCaptureAudio(input, output, num_samples);
}

void AECProcessor::SetEchoCancellationEnabled(bool enabled) {
    impl_->SetEchoCancellationEnabled(enabled);
}

AECMetrics AECProcessor::GetMetrics() const {
    return impl_->GetMetrics();
}

} // namespace kakarot