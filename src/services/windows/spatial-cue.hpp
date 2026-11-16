#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <span>
#include <vector>
#include "navigation-pcm.hpp"

namespace wqa::audio {
constexpr int rate = 48000;
constexpr int cue_frames = 4320;
constexpr int render_frames = cue_frames + 256;
constexpr double rear_pitch = 0.72;
constexpr double route_rear_pitch = 0.88;
constexpr double tau = 6.283185307179586;
enum class Cue : int {
    preview, wall_bump, wall_brush, beacon_pulse, beacon_turn, beacon_arrival, cave_go,
    entity_person, entity_exit, entity_door, entity_stairs, entity_treasure, entity_object, entity_checkpoint,
    battle_lead, battle_power, battle_accuracy, battle_ice, wall_north, footstep,
    wall_east, wall_south, wall_west, count
};

constexpr bool wall_loop(Cue cue) {
    return cue == Cue::wall_north || (cue >= Cue::wall_east && cue <= Cue::wall_west);
}

constexpr std::span<const std::int16_t> navigation_clip(Cue cue) {
    switch (cue) {
    case Cue::wall_bump: return ffpr::wall_bump;
    case Cue::beacon_pulse: return ffpr::beacon;
    case Cue::entity_person: return ffpr::npc;
    case Cue::entity_exit: return ffpr::exit;
    case Cue::entity_door: return ffpr::door;
    case Cue::entity_treasure: return ffpr::chest;
    case Cue::entity_object: return ffpr::event;
    case Cue::entity_checkpoint: return ffpr::save_point;
    case Cue::wall_north: return ffpr::wall_north;
    case Cue::wall_east: return ffpr::wall_east;
    case Cue::wall_south: return ffpr::wall_south;
    case Cue::wall_west: return ffpr::wall_west;
    case Cue::footstep: return ffpr::footstep;
    default: return {};
    }
}

inline int sample_frames(Cue cue, double pitch) {
    const auto clip = navigation_clip(cue);
    return clip.empty() ? cue_frames : static_cast<int>(std::ceil(clip.size() * double(rate) / (ffpr::rate * pitch)));
}

struct Bearing {
    double right;
    double up;
    double forward;
};
using Stereo = std::vector<std::int16_t>;

inline Bearing normalized(Bearing p) {
    const auto length = std::hypot(p.right, p.up, p.forward);
    if (!std::isfinite(length) || length < 1e-6) return {0, 0, 1};
    return {p.right / length, p.up / length, p.forward / length};
}

// Field cues share the original FFPR PCM between the two spatializers.
// Generated tones remain for Wendy Quest cues without an FFPR equivalent.
inline double cue_sample(Cue cue, int frame, double pitch) {
    const auto attack = std::min(1.0, frame / 192.0);
    const auto release = std::min(1.0, (cue_frames - 1 - frame) / 960.0);
    const auto envelope = std::min(attack, release);
    const auto time = static_cast<double>(frame) / rate;
    if (const auto clip = navigation_clip(cue); !clip.empty()) {
        // Match the Core's linear PCM interpolation. For loops, divide one
        // complete clip over the output period and interpolate across its seam.
        const bool loop = wall_loop(cue);
        const auto position = loop ? static_cast<double>(frame) * clip.size() / sample_frames(cue, pitch)
            : frame * pitch * ffpr::rate / rate;
        const auto index = static_cast<size_t>(position);
        if (index >= clip.size()) return 0.0;
        const auto next = index + 1 < clip.size() ? clip[index + 1] : loop ? clip.front() : clip.back();
        return (clip[index] + (next - clip[index]) * (position - index)) / 32767.0;
    }
    if (cue == Cue::wall_brush) {
        const auto phase = tau * 370.0 * pitch * time;
        return envelope * (0.24 * std::sin(phase) + 0.13 * std::sin(4.6 * phase));
    }
    if (cue == Cue::beacon_turn || cue == Cue::beacon_arrival) {
        const bool arrival = cue == Cue::beacon_arrival;
        const double length = arrival ? 0.030 : 0.045;
        const auto segment = std::fmod(time, length);
        const double frequency = cue == Cue::beacon_turn ? 830.0 :
            time < 0.030 ? 630.0 : time < 0.060 ? 800.0 : 1010.0;
        const auto note = std::min({1.0, segment / 0.004, std::max(0.0, (length - 0.002 - segment) / 0.008)});
        return envelope * note * 0.57 * std::sin(tau * frequency * pitch * segment);
    }
    if (cue == Cue::cave_go) {
        const auto segment = std::fmod(time, 0.030);
        const double frequency = time < 0.030 ? 690.0 : time < 0.060 ? 930.0 : 1240.0;
        const auto note = std::min({1.0, segment / 0.003, std::max(0.0, (0.028 - segment) / 0.006)});
        return envelope * note * 0.57 * std::sin(tau * frequency * pitch * segment);
    }
    if (cue == Cue::battle_power || cue == Cue::battle_accuracy) {
        // One short, bright strike starts at the native perfect boundary.
        // A lower metallic accent marks power and a higher bell marks accuracy.
        const bool power = cue == Cue::battle_power;
        const double length = power ? 0.055 : 0.060;
        if (time >= length) return 0.0;
        const auto strike = std::min({1.0, time / 0.001, (length - time) / 0.012});
        const auto phase = tau * pitch * (power ? 550.0 : 1375.0) * time;
        const auto overtones = power
            ? 0.28 * std::sin(2.0 * phase) + 0.13 * std::sin(3.0 * phase)
            : 0.24 * std::sin(1.55 * phase) + 0.12 * std::sin(2.17 * phase);
        return strike * (0.64 * std::sin(phase) + std::exp(-27.0 * time) * overtones);
    }
    if (cue == Cue::battle_lead || cue == Cue::battle_ice) {
        const double frequency = cue == Cue::battle_lead ? 440.0 : time < 0.022 ? 1360.0 : 1050.0;
        const auto segment = cue == Cue::battle_ice ? std::fmod(time, 0.022) : time;
        const double length = cue == Cue::battle_ice ? 0.022 : 0.044;
        if (time >= 0.044) return 0.0;
        const auto note = std::min({1.0, segment / 0.003, std::max(0.0, (length - segment) / 0.009)});
        const auto phase = tau * frequency * pitch * segment;
        return envelope * note * (0.52 * std::sin(phase) + 0.08 * std::sin(2.0 * phase));
    }
    if (cue == Cue::entity_stairs) {
        constexpr double notes[]{380, 505, 670};
        const int slot = frame / (cue_frames / 3);
        const auto segment = static_cast<double>(frame % (cue_frames / 3)) / rate;
        const auto note = std::min({1.0, segment / 0.004, std::max(0.0, (0.029 - segment) / 0.008)});
        const auto phase = tau * notes[slot] * pitch * segment;
        return envelope * note * (0.48 * std::sin(phase) + 0.06 * std::sin(2.0 * phase));
    }
    const auto phase = tau * 660.0 * pitch * time;
    return envelope * (0.52 * std::sin(phase) + 0.17 * std::sin(2 * phase));
}

// Route pings carry a subtle southward pitch cue in both output modes.
constexpr bool route_ping(Cue cue) {
    return cue == Cue::beacon_pulse || cue == Cue::cave_go;
}

inline double hrtf_rate_scale(Cue cue, Bearing bearing, double scale) {
    return route_ping(cue) && bearing.forward < 0.0 ? scale * route_rear_pitch : scale;
}

inline std::int16_t sample16(double value) {
    return static_cast<std::int16_t>(std::lround(std::clamp(value, -1.0, 1.0) * 32767.0));
}

template<class Ready>
bool stereo_cue(Stereo& output, Cue cue, Bearing bearing, double gain, Ready ready, double rate_scale = 1.0) {
    const auto horizontal = std::hypot(bearing.right, bearing.forward);
    const auto pan = horizontal < 1e-6 ? 0.0 : bearing.right / horizontal;
    const auto left = gain * std::sqrt(std::max(0.0, (1.0 - pan) * 0.5));
    const auto right = gain * std::sqrt(std::max(0.0, (1.0 + pan) * 0.5));
    const auto pitch = rate_scale * (bearing.forward < 0.0 ?
        (route_ping(cue) ? route_rear_pitch : rear_pitch) : 1.0);
    const int frames = sample_frames(cue, pitch);
    output.assign(2 * (frames + (wall_loop(cue) ? 0 : render_frames - cue_frames)), 0);
    for (int i = 0; i < frames; ++i) {
        if ((i % 128) == 0 && !ready()) return false;
        const auto sample = cue_sample(cue, i, pitch);
        output[i * 2] = sample16(sample * left);
        output[i * 2 + 1] = sample16(sample * right);
    }
    return ready();
}
}
