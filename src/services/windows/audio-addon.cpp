#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#define SDL_MAIN_HANDLED
#include "audio-device.hpp"
#include "audio-hrtf.hpp"
#include <memory>
#include <new>

namespace {
// Narrow Node-API v1/v3 ABI used by the installed NW node.dll. The Windows
// bridge binds the exports in that already-loaded runtime.
struct napi_env__;
struct napi_value__;
struct napi_callback_info__;
struct napi_ref__;
using Env = napi_env__*;
using Value = napi_value__*;
using Info = napi_callback_info__*;
using Ref = napi_ref__*;
using Callback = Value (*)(Env, Info);

struct Api {
    int (*napi_get_cb_info)(Env, Info, size_t*, Value*, Value*, void**) = nullptr;
    int (*napi_create_function)(Env, const char*, size_t, Callback, void*, Value*) = nullptr;
    int (*napi_set_named_property)(Env, Value, const char*, Value) = nullptr;
    int (*napi_get_buffer_info)(Env, Value, void**, size_t*) = nullptr;
    int (*napi_create_reference)(Env, Value, uint32_t, Ref*) = nullptr;
    int (*napi_delete_reference)(Env, Ref) = nullptr;
    int (*napi_get_value_int32)(Env, Value, int32_t*) = nullptr;
    int (*napi_get_value_double)(Env, Value, double*) = nullptr;
    int (*napi_create_int32)(Env, int32_t, Value*) = nullptr;
    int (*napi_add_env_cleanup_hook)(Env, void (*)(void*), void*) = nullptr;

    bool bind() {
        const HMODULE node = GetModuleHandleW(L"node.dll");
        if (!node) return false;
#define BIND(name) name = reinterpret_cast<decltype(name)>(GetProcAddress(node, #name)); if (!name) return false;
        BIND(napi_get_cb_info)
        BIND(napi_create_function)
        BIND(napi_set_named_property)
        BIND(napi_get_buffer_info)
        BIND(napi_create_reference)
        BIND(napi_delete_reference)
        BIND(napi_get_value_int32)
        BIND(napi_get_value_double)
        BIND(napi_create_int32)
        BIND(napi_add_env_cleanup_hook)
#undef BIND
        return true;
    }
};

std::wstring dependency_root() {
    HMODULE addon = nullptr;
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
        reinterpret_cast<LPCWSTR>(&dependency_root), &addon)) return {};
    std::array<wchar_t, 32768> path{};
    const auto size = GetModuleFileNameW(addon, path.data(), static_cast<DWORD>(path.size()));
    if (!size || size >= path.size()) return {};
    const std::wstring file(path.data(), size);
    const auto slash = file.find_last_of(L"\\/");
    return slash == std::wstring::npos ? std::wstring{} : file.substr(0, slash + 1) + L"audio-deps\\";
}

using namespace wqa::audio;
struct Owner {
    Api api;
    Env env;
    Ref reference = nullptr;
    volatile LONG* generation = nullptr;
    std::unique_ptr<Device> device;
    std::unique_ptr<Hrtf> hrtf;
    std::wstring dependencies;
    bool device_failed = false;
    bool hrtf_failed = false;
    bool hrtf_ready = false;

    static void cleanup(void* data) {
        std::unique_ptr<Owner> owner(static_cast<Owner*>(data));
        owner->device.reset();
        owner->hrtf.reset();
        if (owner->reference) owner->api.napi_delete_reference(owner->env, owner->reference);
    }

    int play(LONG epoch, bool use_hrtf, int cue, Bearing p, double gain, double pitch, int lane) {
        const auto ready = [&] { return admitted(generation, epoch, lane); };
        if (!ready()) return 0;
        if (device_failed || dependencies.empty()) return -1;
        if (!device || !device->active()) {
            device = std::make_unique<Device>(generation);
            if (!device->open(dependencies + L"SDL3.dll", epoch, lane)) {
                device_failed = ready();
                return device_failed ? -1 : 0;
            }
        }
        if (!ready()) return 0;
        if (use_hrtf && !hrtf_ready && !hrtf_failed) {
            hrtf.reset();
            hrtf = std::make_unique<Hrtf>();
            hrtf_ready = hrtf->open(dependencies + L"soft_oal.dll", ready);
            if (!hrtf_ready) {
                hrtf_failed = ready();
                if (!hrtf_failed) return 0;
            }
        }
        if (!ready()) return 0;
        if (cue == -1) return use_hrtf && hrtf_ready ? 2 : 1;
        Stereo samples{};
        p = normalized(p);
        const auto sound = static_cast<Cue>(cue);
        const double hrtf_pitch = hrtf_rate_scale(sound, p, pitch);
        const bool rendered = use_hrtf && hrtf_ready && hrtf->render(samples, sound, p, gain, ready, hrtf_pitch);
        if (!rendered && !stereo_cue(samples, sound, p, gain, ready, pitch)) return 0;
        if (!device->publish(epoch, std::move(samples), lane)) return ready() ? -1 : 0;
        return rendered ? 2 : 1;
    }
};

// Bootstrap the ABI before resolving the per-environment callback data.
template<size_t Count>
Owner* arguments(Env env, Info info, std::array<Value, Count>& args) {
    const auto node = GetModuleHandleW(L"node.dll");
    const auto get = node ? reinterpret_cast<decltype(Api::napi_get_cb_info)>(GetProcAddress(node, "napi_get_cb_info")) : nullptr;
    size_t count = Count;
    void* data = nullptr;
    if (!get || get(env, info, &count, args.data(), nullptr, &data) || count != Count) return nullptr;
    return static_cast<Owner*>(data);
}

Value number(Owner& owner, int32_t result) {
    Value value = nullptr;
    owner.api.napi_create_int32(owner.env, result, &value);
    return value;
}

Value attach(Env env, Info info) {
    std::array<Value, 1> args{};
    const auto owner = arguments(env, info, args);
    if (!owner) return nullptr;
    void* address = nullptr;
    size_t size = 0;
    if (owner->reference || owner->api.napi_get_buffer_info(env, args[0], &address, &size) || !address ||
        size != sizeof(LONG) * (output_lanes + 1) || reinterpret_cast<uintptr_t>(address) % alignof(LONG) ||
        owner->api.napi_create_reference(env, args[0], 1, &owner->reference)) return number(*owner, 0);
    owner->generation = static_cast<volatile LONG*>(address);
    return number(*owner, 1);
}

Value play(Env env, Info info) {
    std::array<Value, 9> args{};
    const auto owner = arguments(env, info, args);
    if (!owner) return nullptr;
    int32_t epoch = 0, hrtf = 0, cue = 0, lane = 0;
    Bearing p{};
    double gain = 0, pitch = 1;
    auto& api = owner->api;
    if (api.napi_get_value_int32(env, args[0], &epoch) || api.napi_get_value_int32(env, args[1], &hrtf) ||
        api.napi_get_value_int32(env, args[2], &cue) || cue < -1 || cue >= static_cast<int>(Cue::count) ||
        api.napi_get_value_double(env, args[3], &p.right) || api.napi_get_value_double(env, args[4], &p.up) ||
        api.napi_get_value_double(env, args[5], &p.forward) || api.napi_get_value_double(env, args[6], &gain) ||
        api.napi_get_value_double(env, args[7], &pitch) ||
        api.napi_get_value_int32(env, args[8], &lane) || lane < 0 || lane >= output_lanes ||
        (is_wall_lane(lane) && (cue != static_cast<int>(wall_lane_cue(lane)) || pitch != 1.0)) ||
        (lane == impact && cue != static_cast<int>(Cue::wall_bump)) ||
        (lane >= player_step_begin && cue != static_cast<int>(Cue::footstep)) ||
        (lane >= soundscape_begin && lane < player_step_begin && cue != static_cast<int>(Cue::footstep) &&
            (cue < static_cast<int>(Cue::entity_person) || cue > static_cast<int>(Cue::entity_checkpoint))) ||
        !std::isfinite(pitch) ||
        pitch < (lane >= soundscape_begin && lane < player_step_begin && cue == static_cast<int>(Cue::footstep) ? 0.64 : 0.75) ||
        pitch > 1.25 ||
        !std::isfinite(gain) || gain < 0.0 || gain > 1.0) return number(*owner, -1);
    try { return number(*owner, owner->play(epoch, hrtf == 1, cue, p, gain, pitch, lane)); }
    catch (...) { return number(*owner, -1); }
}
}

extern "C" __declspec(dllexport) Value napi_register_module_v1(Env env, Value exports) {
    auto owner = std::unique_ptr<Owner>(new (std::nothrow) Owner{});
    if (!owner || !owner->api.bind()) return exports;
    owner->env = env;
    try { owner->dependencies = dependency_root(); } catch (...) { return exports; }
    auto& api = owner->api;
    Value attach_fn = nullptr, play_fn = nullptr;
    if (api.napi_create_function(env, "attach", 6, attach, owner.get(), &attach_fn) ||
        api.napi_create_function(env, "play", 4, play, owner.get(), &play_fn) ||
        api.napi_add_env_cleanup_hook(env, Owner::cleanup, owner.get())) return exports;
    owner.release();
    api.napi_set_named_property(env, exports, "attach", attach_fn);
    api.napi_set_named_property(env, exports, "play", play_fn);
    return exports;
}
