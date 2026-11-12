#pragma once

#include "spatial-cue.hpp"
#include <windows.h>
#include <AL/al.h>
#include <AL/alc.h>
#include <AL/alext.h>
#include <cstring>
#include <string>

namespace wqa::audio {
class Hrtf {
#define WQA_AL(X) X(alcGetProcAddress) X(alcIsExtensionPresent) X(alcCreateContext) X(alcDestroyContext) \
    X(alcCloseDevice) X(alcGetIntegerv) X(alcGetString) X(alGenBuffers) X(alBufferData) X(alGenSources) \
    X(alSourcei) X(alSourcef) X(alSource3f) X(alSourcePlay) X(alSourceStop) X(alDistanceModel) X(alGetError)
#define FIELD(name) decltype(&::name) name##_ = nullptr;
    WQA_AL(FIELD)
#undef FIELD
    HMODULE library_ = nullptr;
    ALCdevice* device_ = nullptr;
    ALCcontext* context_ = nullptr;
    LPALCRENDERSAMPLESSOFT render_ = nullptr;
    PFNALCSETTHREADCONTEXTPROC set_thread_ = nullptr;
    ALuint source_ = 0;
    ALuint buffer_ = 0;
    bool available_ = false;

public:
    Hrtf() = default;
    Hrtf(const Hrtf&) = delete;
    Hrtf& operator=(const Hrtf&) = delete;
    ~Hrtf() {
        if (context_) {
            set_thread_(nullptr);
            alcDestroyContext_(context_);
        }
        if (device_) alcCloseDevice_(device_);
        if (library_) FreeLibrary(library_);
    }

    template<class Ready>
    bool open(const std::wstring& path, Ready ready) {
        if (!ready() || GetModuleHandleW(L"soft_oal.dll")) return false;
        library_ = LoadLibraryExW(path.c_str(), nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
        if (!library_) return false;
#define BIND(name) name##_ = reinterpret_cast<decltype(name##_)>(GetProcAddress(library_, #name)); if (!name##_) return false;
        WQA_AL(BIND)
#undef BIND
        if (!ready() || !alcIsExtensionPresent_(nullptr, "ALC_SOFT_loopback") ||
            !alcIsExtensionPresent_(nullptr, "ALC_EXT_thread_local_context")) return false;
        const auto loopback = reinterpret_cast<LPALCLOOPBACKOPENDEVICESOFT>(alcGetProcAddress_(nullptr, "alcLoopbackOpenDeviceSOFT"));
        const auto format = reinterpret_cast<LPALCISRENDERFORMATSUPPORTEDSOFT>(alcGetProcAddress_(nullptr, "alcIsRenderFormatSupportedSOFT"));
        render_ = reinterpret_cast<LPALCRENDERSAMPLESSOFT>(alcGetProcAddress_(nullptr, "alcRenderSamplesSOFT"));
        set_thread_ = reinterpret_cast<PFNALCSETTHREADCONTEXTPROC>(alcGetProcAddress_(nullptr, "alcSetThreadContext"));
        const auto name_at = reinterpret_cast<LPALCGETSTRINGISOFT>(alcGetProcAddress_(nullptr, "alcGetStringiSOFT"));
        if (!loopback || !format || !render_ || !set_thread_ || !name_at || !ready()) return false;
        device_ = loopback(nullptr);
        if (!device_ || !alcIsExtensionPresent_(device_, "ALC_SOFT_HRTF") ||
            !format(device_, rate, ALC_STEREO_SOFT, ALC_SHORT_SOFT)) return false;
        ALCint sets = 0;
        alcGetIntegerv_(device_, ALC_NUM_HRTF_SPECIFIERS_SOFT, 1, &sets);
        ALCint builtin = -1;
        for (ALCint i = 0; i < std::min<ALCint>(sets, 64); ++i) {
            const auto name = name_at(device_, ALC_HRTF_SPECIFIER_SOFT, i);
            if (name && std::strcmp(name, "Built-In HRTF") == 0) {
                builtin = i;
                break;
            }
        }
        if (builtin < 0 || !ready()) return false;
        const ALCint options[] = {ALC_FREQUENCY, rate, ALC_FORMAT_CHANNELS_SOFT, ALC_STEREO_SOFT,
            ALC_FORMAT_TYPE_SOFT, ALC_SHORT_SOFT, ALC_HRTF_SOFT, ALC_TRUE, ALC_HRTF_ID_SOFT, builtin, 0};
        context_ = alcCreateContext_(device_, options);
        if (!context_ || !ready() || !set_thread_(context_)) return false;
        ALCint enabled = 0;
        alcGetIntegerv_(device_, ALC_HRTF_SOFT, 1, &enabled);
        const auto name = alcGetString_(device_, ALC_HRTF_SPECIFIER_SOFT);
        if (!enabled || !name || std::strcmp(name, "Built-In HRTF") != 0 || !ready()) return false;
        std::array<std::int16_t, cue_frames> mono{};
        for (int i = 0; i < cue_frames; ++i) {
            if ((i % 128) == 0 && !ready()) return false;
            mono[i] = sample16(preview_sample(i, 1.0));
        }
        if (!ready()) return false;
        alDistanceModel_(AL_NONE);
        alGenBuffers_(1, &buffer_);
        alBufferData_(buffer_, AL_FORMAT_MONO16, mono.data(), static_cast<ALsizei>(sizeof(mono)), rate);
        alGenSources_(1, &source_);
        alSourcei_(source_, AL_SOURCE_RELATIVE, AL_TRUE);
        alSourcei_(source_, AL_BUFFER, static_cast<ALint>(buffer_));
        available_ = alGetError_() == AL_NO_ERROR && ready();
        return available_;
    }

    template<class Ready>
    bool render(Stereo& output, Bearing p, double gain, Ready ready) {
        if (!available_ || !ready()) return false;
        alSourceStop_(source_);
        alSource3f_(source_, AL_POSITION, static_cast<float>(p.right), static_cast<float>(p.up), static_cast<float>(-p.forward));
        alSourcef_(source_, AL_GAIN, static_cast<float>(gain));
        if (!ready()) return false;
        alSourcePlay_(source_);
        for (int i = 0; i < render_frames; i += 128) {
            if (!ready()) return false;
            render_(device_, output.data() + i * 2, std::min(128, render_frames - i));
        }
        return alGetError_() == AL_NO_ERROR && ready();
    }
};
#undef WQA_AL
}
