#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <prism.h>

#include <array>
#include <cstdio>
#include <cstring>
#include <string_view>

namespace {

// This process is the only owner of the PRISM context and backend. Calls may
// wait for a screen reader or the OS. The game never waits for this process.
class Speech {
public:
    Speech() = default;
    Speech(const Speech&) = delete;
    Speech& operator=(const Speech&) = delete;

    ~Speech() {
        if (backend_) release_(backend_);
        if (context_) shutdown_(context_);
        if (module_) FreeLibrary(module_);
    }

    bool open() {
        constexpr auto search = LOAD_LIBRARY_SEARCH_APPLICATION_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32;
        if (!SetDefaultDllDirectories(search)) return false;
        module_ = LoadLibraryExW(L"prism.dll", nullptr, search);
        if (!module_) return false;

        const auto configInit = symbol<decltype(&prism_config_init)>("prism_config_init");
        const auto initialize = symbol<decltype(&prism_init)>("prism_init");
        const auto acquire = symbol<decltype(&prism_registry_acquire_best)>("prism_registry_acquire_best");
        const auto features = symbol<decltype(&prism_backend_get_features)>("prism_backend_get_features");
        const auto pausePoll = symbol<decltype(&prism_availability_poll_pause)>("prism_availability_poll_pause");
        release_ = symbol<decltype(release_)>("prism_backend_free");
        shutdown_ = symbol<decltype(shutdown_)>("prism_shutdown");
        output_ = symbol<decltype(output_)>("prism_backend_output");
        speak_ = symbol<decltype(speak_)>("prism_backend_speak");
        stop_ = symbol<decltype(stop_)>("prism_backend_stop");
        if (!configInit || !initialize || !acquire || !features || !pausePoll ||
            !release_ || !shutdown_ || !output_ || !speak_ || !stop_) return false;

        auto config = configInit();
        // No availability callback is installed. Select once on the owner and
        // stop background availability probing before entering pipe service.
        context_ = initialize(&config);
        if (!context_) return false;
        backend_ = acquire(context_);
        pausePoll(context_);
        if (!backend_) return false;
        capabilities_ = features(backend_);
        return capabilities_ & (PRISM_BACKEND_SUPPORTS_OUTPUT | PRISM_BACKEND_SUPPORTS_SPEAK);
    }

    bool output(const char* text) const {
        if (capabilities_ & PRISM_BACKEND_SUPPORTS_OUTPUT) return output_(backend_, text, true) == PRISM_OK;
        return speak_(backend_, text, true) == PRISM_OK;
    }

    void stop() const {
        if (capabilities_ & PRISM_BACKEND_SUPPORTS_STOP) static_cast<void>(stop_(backend_));
    }

private:
    template <typename Fn> Fn symbol(const char* name) const {
        // Win32 GetProcAddress returns FARPROC. The pinned PRISM header supplies
        // the ABI for each named export.
        return reinterpret_cast<Fn>(GetProcAddress(module_, name));
    }

    HMODULE module_ = nullptr;
    PrismContext* context_ = nullptr;
    PrismBackend* backend_ = nullptr;
    uint64_t capabilities_ = 0;
    decltype(&prism_backend_free) release_ = nullptr;
    decltype(&prism_shutdown) shutdown_ = nullptr;
    decltype(&prism_backend_output) output_ = nullptr;
    decltype(&prism_backend_speak) speak_ = nullptr;
    decltype(&prism_backend_stop) stop_ = nullptr;
};

bool reply(char code) {
    return std::putchar(code) != EOF && std::putchar('\n') != EOF && std::fflush(stdout) == 0;
}

} // namespace

int main(int argc, const char* argv[]) {
    const bool check = argc == 2 && std::string_view(argv[1]) == "--check";
    if (argc != 1 && !check) return 2;
    Speech speech;
    if (!speech.open()) return 3;
    if (!reply('R')) return 4;
    if (check) return 0;

    // Cap protocol lines before use. The JS side submits at most 256 UTF-16
    // code units plus short fixed text and issues one command per reply.
    std::array<char, 1100> line{};
    while (std::fgets(line.data(), static_cast<int>(line.size()), stdin)) {
        const auto length = std::strlen(line.data());
        if (!length || line[length - 1] != '\n') return 5;
        line[length - 1] = '\0';
        if (length == 2 && line[0] == 'C') {
            speech.stop();
            if (!reply('C')) break;
        } else if (length > 2 && line[0] == 'S') {
            if (!speech.output(line.data() + 1)) return 6;
            if (!reply('S')) break;
        } else {
            return 5;
        }
    }
    speech.stop();
    return 0;
}
