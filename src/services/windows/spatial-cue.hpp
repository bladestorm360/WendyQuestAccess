#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>

namespace wqa::audio {
constexpr int rate = 48000;
constexpr int cue_frames = 4320;
constexpr int render_frames = cue_frames + 256;
constexpr double rear_pitch = 0.72;
constexpr double tau = 6.283185307179586;
enum class Cue : int { preview, wall_bump, wall_brush, beacon_pulse, beacon_turn, beacon_arrival, count };

struct Bearing {
    double right;
    double up;
    double forward;
};
using Stereo = std::array<std::int16_t, render_frames * 2>;

inline Bearing normalized(Bearing p) {
    const auto length = std::hypot(p.right, p.up, p.forward);
    if (!std::isfinite(length) || length < 1e-6) return {0, 0, 1};
    return {p.right / length, p.up / length, p.forward / length};
}

// Original cue bank. Attack and release prevent discontinuities. Both
// spatializers use these same identities and only stereo changes rear pitch.
inline double cue_sample(Cue cue, int frame, double pitch) {
    const auto attack = std::min(1.0, frame / 192.0);
    const auto release = std::min(1.0, (cue_frames - 1 - frame) / 960.0);
    const auto envelope = std::min(attack, release);
    const auto time = static_cast<double>(frame) / rate;
    if (cue == Cue::wall_bump) {
        const auto phase = tau * 185.0 * pitch * time;
        return envelope * std::exp(-39.0 * time) * (0.56 * std::sin(phase) + 0.28 * std::sin(3.1 * phase));
    }
    if (cue == Cue::wall_brush) {
        const auto phase = tau * 370.0 * pitch * time;
        return envelope * (0.24 * std::sin(phase) + 0.13 * std::sin(4.6 * phase));
    }
    if (cue == Cue::beacon_pulse || cue == Cue::beacon_turn || cue == Cue::beacon_arrival) {
        const auto segment = cue == Cue::beacon_pulse ? time : std::fmod(time, 0.045);
        const double frequency = cue == Cue::beacon_pulse ? 520.0 : cue == Cue::beacon_turn ? 830.0 :
            time < 0.045 ? 630.0 : 940.0;
        const auto note = std::min({1.0, segment / 0.004, std::max(0.0, (0.043 - segment) / 0.010)});
        return envelope * note * 0.57 * std::sin(tau * frequency * pitch * segment);
    }
    const auto phase = tau * 660.0 * pitch * time;
    return envelope * (0.52 * std::sin(phase) + 0.17 * std::sin(2 * phase));
}

inline std::int16_t sample16(double value) {
    return static_cast<std::int16_t>(std::lround(std::clamp(value, -1.0, 1.0) * 32767.0));
}

template<class Ready>
bool stereo_cue(Stereo& output, Cue cue, Bearing bearing, double gain, Ready ready) {
    const auto horizontal = std::hypot(bearing.right, bearing.forward);
    const auto pan = horizontal < 1e-6 ? 0.0 : bearing.right / horizontal;
    const auto left = gain * std::sqrt(std::max(0.0, (1.0 - pan) * 0.5));
    const auto right = gain * std::sqrt(std::max(0.0, (1.0 + pan) * 0.5));
    const auto pitch = bearing.forward < 0.0 ? rear_pitch : 1.0;
    for (int i = 0; i < cue_frames; ++i) {
        if ((i % 128) == 0 && !ready()) return false;
        const auto sample = cue_sample(cue, i, pitch);
        output[i * 2] = sample16(sample * left);
        output[i * 2 + 1] = sample16(sample * right);
    }
    std::fill(output.begin() + cue_frames * 2, output.end(), std::int16_t{0});
    return ready();
}
}
