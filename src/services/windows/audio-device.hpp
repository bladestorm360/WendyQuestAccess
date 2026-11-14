#pragma once

#include "spatial-cue.hpp"
#include <windows.h>
#include <SDL3/SDL_audio.h>
#include <SDL3/SDL_hints.h>
#include <SDL3/SDL_init.h>
#include <SDL3/SDL_main.h>
#include <SDL3/SDL_version.h>
#include <string>

namespace wqa::audio {
enum OutputLane { ordinary, wall_north, footstep, wall_east, wall_south, wall_west, output_lanes };

constexpr bool is_wall_lane(int lane) {
    return lane == wall_north || (lane >= wall_east && lane <= wall_west);
}

constexpr Cue wall_lane_cue(int lane) {
    switch (lane) {
    case wall_north: return Cue::wall_north;
    case wall_east: return Cue::wall_east;
    case wall_south: return Cue::wall_south;
    default: return Cue::wall_west;
    }
}
constexpr int wall_lease_ms = 3500;
constexpr int wall_fade_frames = rate / 2;
constexpr int wall_attack_step = (wall_fade_frames + 255) / 256;

constexpr int wall_level(int previous, int remaining) {
    // Fade to silence over the last half-second of the existing lease.
    // A fresh step can extend that lease while the same loop ramps back up.
    return std::min({wall_fade_frames, remaining, previous + wall_attack_step});
}

inline bool admitted(volatile LONG* word, LONG epoch, int lane = 0) {
    return word && epoch > 0 && InterlockedCompareExchange(word + lane, 0, 0) == epoch;
}

inline uint32_t unix_ms() {
    FILETIME time{};
    GetSystemTimePreciseAsFileTime(&time);
    ULARGE_INTEGER ticks{};
    ticks.LowPart = time.dwLowDateTime;
    ticks.HighPart = time.dwHighDateTime;
    return static_cast<uint32_t>((ticks.QuadPart - 116444736000000000ULL) / 10000);
}

class Device {
#define WQA_SDL(X) X(SDL_GetVersion) X(SDL_IsMainThread) X(SDL_SetMainReady) X(SDL_SetHint) X(SDL_InitSubSystem) \
    X(SDL_QuitSubSystem) X(SDL_OpenAudioDeviceStream) X(SDL_ResumeAudioStreamDevice) X(SDL_DestroyAudioStream) \
    X(SDL_LockAudioStream) X(SDL_UnlockAudioStream) X(SDL_PutAudioStreamData) \
    X(SDL_SetAudioStreamGetCallback)
#define FIELD(name) decltype(&::name) name##_ = nullptr;
    WQA_SDL(FIELD)
#undef FIELD
    HMODULE library_ = nullptr;
    SDL_AudioStream* stream_ = nullptr;
    bool initialized_ = false;
    bool ready_ = false;
    volatile LONG* word_;
    struct Voice {
        LONG epoch = 0;
        Stereo samples{};
        int next = render_frames;
        int level = 0;
    };
    std::array<Voice, output_lanes> voices_{};
#ifdef WQA_AUDIO_TEST
    int submitted_ = 0;
    int callbacks_ = 0;
#endif

    static void SDLCALL supply(void* user, SDL_AudioStream* stream, int amount, int) {
        auto& self = *static_cast<Device*>(user);
        constexpr int bytes_per_frame = 2 * sizeof(std::int16_t);
#ifdef WQA_AUDIO_TEST
        ++self.callbacks_;
#endif
        int frames = std::min(amount / bytes_per_frame, 1024);
        const int requested = frames;
        // All wall voices share the movement deadline. Read the clock once
        // per callback, only when at least one wall can still be mixed.
        uint32_t block_start = 0;
        for (int lane = wall_north; lane < output_lanes; ++lane) {
            if (is_wall_lane(lane) && admitted(self.word_, self.voices_[lane].epoch, lane)) {
                block_start = unix_ms();
                break;
            }
        }
        while (frames > 0) {
            std::array<int32_t, 512> mix{};
            const int capacity = std::min(frames, 256);
            int mixed = 0;
            for (int lane = 0; lane < output_lanes; ++lane) {
                auto& voice = self.voices_[lane];
                if (!admitted(self.word_, voice.epoch, lane)) continue;
                int count = std::min(capacity, render_frames - voice.next);
                int remaining = 0;
                const bool wall = is_wall_lane(lane);
                if (wall) {
                    const auto deadline = static_cast<uint32_t>(InterlockedCompareExchange(self.word_ + output_lanes, 0, 0));
                    const auto ms = static_cast<int32_t>(deadline - block_start);
                    if (ms <= 0 || ms > wall_lease_ms) continue;
                    // Keep the envelope advancing when SDL requests more
                    // than one chunk of audio in a single callback.
                    remaining = ms * (rate / 1000) - (requested - frames);
                    count = std::clamp(remaining, 0, capacity);
                }
                for (int i = 0; i < count; ++i) {
                    if (wall) {
                        voice.level = wall_level(voice.level, remaining - i - 1);
                        for (int channel = 0; channel < 2; ++channel)
                            mix[i * 2 + channel] += voice.samples[voice.next * 2 + channel] * voice.level / wall_fade_frames;
                    } else {
                        for (int channel = 0; channel < 2; ++channel)
                            mix[i * 2 + channel] += voice.samples[voice.next * 2 + channel];
                    }
                    ++voice.next;
                    if (wall && voice.next == cue_frames) voice.next = 0;
                }
                mixed = std::max(mixed, count);
            }
            if (!mixed) break;
            std::array<std::int16_t, 512> output{};
            for (int i = 0; i < mixed * 2; ++i)
                output[i] = static_cast<std::int16_t>(std::clamp(mix[i], -32768, 32767));
            if (!self.SDL_PutAudioStreamData_(stream, output.data(), mixed * bytes_per_frame)) {
                self.SDL_SetAudioStreamGetCallback_(stream, nullptr, nullptr);
                return;
            }
            frames -= mixed;
#ifdef WQA_AUDIO_TEST
            self.submitted_ += mixed;
#endif
            if (mixed < capacity) break;
        }
        // SDL owns a recursive stream mutex during supply. An empty mix
        // leaves no periodic mod callback until the worker publishes again.
        bool active = false;
        for (int lane = 0; lane < output_lanes; ++lane) {
            const auto& voice = self.voices_[lane];
            if (!admitted(self.word_, voice.epoch, lane) || voice.next == render_frames) continue;
            if (is_wall_lane(lane)) {
                const auto deadline = static_cast<uint32_t>(InterlockedCompareExchange(self.word_ + output_lanes, 0, 0));
                const auto ms = static_cast<int32_t>(deadline - unix_ms());
                if (ms <= 0 || ms > wall_lease_ms) continue;
            }
            active = true;
        }
        if (!active) self.SDL_SetAudioStreamGetCallback_(stream, nullptr, nullptr);
    }

public:
    explicit Device(volatile LONG* word) : word_(word) {}
    Device(const Device&) = delete;
    Device& operator=(const Device&) = delete;
    ~Device() {
        if (stream_) SDL_DestroyAudioStream_(stream_);
        if (initialized_) SDL_QuitSubSystem_(SDL_INIT_AUDIO);
        if (library_) FreeLibrary(library_);
    }

    bool active() const { return ready_; }

    bool open(const std::wstring& path, LONG epoch, int lane = 0) {
        if (!admitted(word_, epoch, lane) || GetModuleHandleW(L"SDL3.dll")) return false;
        library_ = LoadLibraryExW(path.c_str(), nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
        if (!library_) return false;
#define BIND(name) name##_ = reinterpret_cast<decltype(name##_)>(GetProcAddress(library_, #name)); if (!name##_) return false;
        WQA_SDL(BIND)
#undef BIND
        if (SDL_GetVersion_() != SDL_VERSIONNUM(3, 4, 4) || !SDL_IsMainThread_() || !admitted(word_, epoch, lane)) return false;
        SDL_SetMainReady_();
        SDL_SetHint_(SDL_HINT_AUDIO_DEVICE_SAMPLE_FRAMES, "256");
        if (!admitted(word_, epoch, lane) || !SDL_InitSubSystem_(SDL_INIT_AUDIO)) return false;
        initialized_ = true;
        if (!admitted(word_, epoch, lane)) return false;
        const SDL_AudioSpec format{SDL_AUDIO_S16, 2, rate};
        stream_ = SDL_OpenAudioDeviceStream_(SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK, &format, nullptr, nullptr);
        if (!stream_ || !admitted(word_, epoch, lane)) return false;
        ready_ = SDL_ResumeAudioStreamDevice_(stream_);
        return ready_;
    }

    bool publish(LONG epoch, const Stereo& data, int lane = 0) {
        if (!ready_ || !admitted(word_, epoch, lane) || !SDL_LockAudioStream_(stream_)) return false;
        bool current = admitted(word_, epoch, lane);
        if (current) {
            auto& voice = voices_[lane];
            voice.samples = data;
            voice.epoch = epoch;
            voice.next = voice.level = 0;
            current = SDL_SetAudioStreamGetCallback_(stream_, supply, this);
        }
        SDL_UnlockAudioStream_(stream_);
        return current;
    }

#ifdef WQA_AUDIO_TEST
    int submitted() {
        if (!SDL_LockAudioStream_(stream_)) return -1;
        const int count = submitted_;
        SDL_UnlockAudioStream_(stream_);
        return count;
    }
    int position(int lane) {
        if (!SDL_LockAudioStream_(stream_)) return -1;
        const int next = voices_[lane].next;
        SDL_UnlockAudioStream_(stream_);
        return next;
    }
    int callbacks() {
        if (!SDL_LockAudioStream_(stream_)) return -1;
        const int count = callbacks_;
        SDL_UnlockAudioStream_(stream_);
        return count;
    }
#endif
};
#undef WQA_SDL
}
