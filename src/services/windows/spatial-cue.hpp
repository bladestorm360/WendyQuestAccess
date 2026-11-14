#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>

namespace wqa::audio {
constexpr int rate = 48000;
constexpr int cue_frames = 4320;
constexpr int footstep_pip_frames = rate * 13 / 1000;
constexpr int footstep_toe_frame = rate * 22 / 1000;
constexpr int render_frames = cue_frames + 256;
constexpr double rear_pitch = 0.72;
constexpr double beacon_rear_pitch = 0.88;
constexpr double tau = 6.283185307179586;
enum class Cue : int {
    preview, wall_bump, wall_brush, beacon_pulse, beacon_turn, beacon_arrival, cave_go,
    entity_person, entity_exit, entity_door, entity_stairs, entity_treasure, entity_object, entity_checkpoint,
    battle_lead, battle_power, battle_accuracy, battle_ice, wall_north, footstep,
    wall_east, wall_south, wall_west, count
};

constexpr int wall_cycles(Cue cue) {
    // Pixel Remaster's directional pitches, rounded to complete cycles
    // in a 90 ms loop so both spatial output modes join cleanly.
    switch (cue) {
    case Cue::wall_north: return 26;
    case Cue::wall_east: return 22;
    case Cue::wall_south: return 15;
    case Cue::wall_west: return 18;
    default: return 0;
    }
}

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
        const bool arrival = cue == Cue::beacon_arrival;
        const double length = arrival ? 0.030 : 0.045;
        const auto segment = cue == Cue::beacon_pulse ? time : std::fmod(time, length);
        const double frequency = cue == Cue::beacon_pulse ? 520.0 : cue == Cue::beacon_turn ? 830.0 :
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
    if (const int cycles = wall_cycles(cue)) {
        const auto phase = tau * std::round(cycles * pitch) * frame / cue_frames;
        return 0.24 * std::sin(phase) + 0.08 * std::sin(2.0 * phase);
    }
    if (cue == Cue::footstep) {
        // The heel holds each noise sample longer for a bassier texture.
        // A short gap separates the brighter, independently seeded toe pip.
        const double source = frame * pitch;
        const bool toe = source >= footstep_toe_frame;
        const double offset = toe ? source - footstep_toe_frame : source;
        if (offset >= footstep_pip_frames) return 0.0;
        uint32_t noise = (static_cast<uint32_t>(offset / (toe ? 4 : 7)) + (toe ? 257u : 1u)) * 0x9e3779b9u;
        noise ^= noise >> 16;
        noise *= 0x7feb352du;
        noise ^= noise >> 15;
        const double value = (noise >> 24) / 127.5 - 1.0;
        const double onset = std::min(1.0, offset / 16.0);
        return (toe ? 0.30 : 0.27) * onset * value * std::exp(-7.0 * offset / footstep_pip_frames);
    }
    if (cue >= Cue::battle_lead && cue <= Cue::battle_ice) {
        const double frequency = cue == Cue::battle_lead ? 440.0 : cue == Cue::battle_power ? 625.0 :
            cue == Cue::battle_accuracy ? 950.0 : time < 0.022 ? 1360.0 : 1050.0;
        const auto segment = cue == Cue::battle_ice ? std::fmod(time, 0.022) : time;
        const double length = cue == Cue::battle_ice ? 0.022 : 0.044;
        if (time >= 0.044) return 0.0;
        const auto note = std::min({1.0, segment / 0.003, std::max(0.0, (length - segment) / 0.009)});
        const auto phase = tau * frequency * pitch * segment;
        return envelope * note * (0.52 * std::sin(phase) + 0.08 * std::sin(2.0 * phase));
    }
    if (cue >= Cue::entity_person && cue <= Cue::entity_checkpoint) {
        // Three short slots permit category rhythms to stay distinct even
        // when the stereo backend lowers every rear-facing cue's pitch.
        constexpr std::array<std::array<double, 3>, 7> notes{{
            {{405, 0, 525}},     // People
            {{610, 460, 0}},     // Exit
            {{205, 205, 0}},     // Door
            {{380, 505, 670}},   // Stairs
            {{1020, 0, 1350}},   // Treasure
            {{360, 0, 0}},       // Interactible object
            {{715, 520, 715}}    // Checkpoint
        }};
        const int slot = frame / (cue_frames / 3);
        const auto segment = static_cast<double>(frame % (cue_frames / 3)) / rate;
        const auto frequency = notes[static_cast<int>(cue) - static_cast<int>(Cue::entity_person)][slot];
        if (frequency == 0.0) return 0.0;
        const auto note = std::min({1.0, segment / 0.004, std::max(0.0, (0.029 - segment) / 0.008)});
        const auto phase = tau * frequency * pitch * segment;
        const auto harmonic = cue == Cue::entity_door ? 0.19 : 0.06;
        return envelope * note * (0.48 * std::sin(phase) + harmonic * std::sin(2.0 * phase));
    }
    const auto phase = tau * 660.0 * pitch * time;
    return envelope * (0.52 * std::sin(phase) + 0.17 * std::sin(2 * phase));
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
        (cue == Cue::beacon_pulse ? beacon_rear_pitch : rear_pitch) : 1.0);
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
