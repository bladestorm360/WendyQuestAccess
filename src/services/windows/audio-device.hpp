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
inline bool admitted(volatile LONG* word, LONG epoch) {
    return word && epoch > 0 && InterlockedCompareExchange(word, 0, 0) == epoch;
}

class Device {
#define WQA_SDL(X) X(SDL_GetVersion) X(SDL_IsMainThread) X(SDL_SetMainReady) X(SDL_SetHint) X(SDL_InitSubSystem) \
    X(SDL_QuitSubSystem) X(SDL_OpenAudioDeviceStream) X(SDL_ResumeAudioStreamDevice) X(SDL_DestroyAudioStream) \
    X(SDL_LockAudioStream) X(SDL_UnlockAudioStream) X(SDL_PutAudioStreamData) X(SDL_ClearAudioStream)
#define FIELD(name) decltype(&::name) name##_ = nullptr;
    WQA_SDL(FIELD)
#undef FIELD
    HMODULE library_ = nullptr;
    SDL_AudioStream* stream_ = nullptr;
    bool initialized_ = false;
    bool ready_ = false;
    volatile LONG* word_;
    LONG epoch_ = 0;
    Stereo samples_{};
    int next_ = render_frames;
#ifdef WQA_AUDIO_TEST
    int submitted_ = 0;
#endif

    static void SDLCALL supply(void* user, SDL_AudioStream* stream, int amount, int) {
        auto& self = *static_cast<Device*>(user);
        constexpr int bytes_per_frame = 2 * sizeof(std::int16_t);
        if (!admitted(self.word_, self.epoch_) || amount < bytes_per_frame) return;
        int frames = std::min({amount / bytes_per_frame, render_frames - self.next_, 1024});
        while (frames > 0 && admitted(self.word_, self.epoch_)) {
            const int count = std::min(frames, 256);
            if (!self.SDL_PutAudioStreamData_(stream, self.samples_.data() + self.next_ * 2, count * bytes_per_frame)) break;
            self.next_ += count;
            frames -= count;
#ifdef WQA_AUDIO_TEST
            self.submitted_ += count;
#endif
        }
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

    bool open(const std::wstring& path, LONG epoch) {
        if (!admitted(word_, epoch) || GetModuleHandleW(L"SDL3.dll")) return false;
        library_ = LoadLibraryExW(path.c_str(), nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
        if (!library_) return false;
#define BIND(name) name##_ = reinterpret_cast<decltype(name##_)>(GetProcAddress(library_, #name)); if (!name##_) return false;
        WQA_SDL(BIND)
#undef BIND
        if (SDL_GetVersion_() != SDL_VERSIONNUM(3, 4, 4) || !SDL_IsMainThread_() || !admitted(word_, epoch)) return false;
        SDL_SetMainReady_();
        SDL_SetHint_(SDL_HINT_AUDIO_DEVICE_SAMPLE_FRAMES, "256");
        if (!admitted(word_, epoch) || !SDL_InitSubSystem_(SDL_INIT_AUDIO)) return false;
        initialized_ = true;
        if (!admitted(word_, epoch)) return false;
        const SDL_AudioSpec format{SDL_AUDIO_S16, 2, rate};
        stream_ = SDL_OpenAudioDeviceStream_(SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK, &format, supply, this);
        if (!stream_ || !admitted(word_, epoch)) return false;
        ready_ = SDL_ResumeAudioStreamDevice_(stream_);
        return ready_;
    }

    bool publish(LONG epoch, const Stereo& data) {
        if (!ready_ || !admitted(word_, epoch) || !SDL_ClearAudioStream_(stream_) || !SDL_LockAudioStream_(stream_)) return false;
        const bool current = admitted(word_, epoch);
        if (current) {
            samples_ = data;
            epoch_ = epoch;
            next_ = 0;
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
#endif
};
#undef WQA_SDL
}
