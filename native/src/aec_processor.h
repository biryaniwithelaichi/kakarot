#pragma once

#include <memory>
#include <vector>
#include <string>

namespace kakarot {

struct AECConfig {
    bool enable_aec = true;
    bool enable_agc = false;
    bool enable_ns = true;
    bool disable_aec_on_headphones = true;
    int frame_duration_ms = 10;
};

struct AECMetrics {
    float echo_return_loss = 0.0f;
    float echo_return_loss_enhancement = 0.0f;
    int render_delay_ms = 0;
    bool aec_converged = false;
    float rms_level = 0.0f;
    float peak_level = 0.0f;
};

class AECProcessor {
public:
    explicit AECProcessor(const AECConfig& config);
    ~AECProcessor();

    bool Initialize(int sample_rate, int num_channels);
    void ProcessRenderAudio(const float* data, size_t num_samples);
    void ProcessCaptureAudio(const float* input, float* output, size_t num_samples);
    void SetEchoCancellationEnabled(bool enabled);
    AECMetrics GetMetrics() const;

private:
    class Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace kakarot
