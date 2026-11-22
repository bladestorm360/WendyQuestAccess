// Standalone installer utility. Runs only the mod's local geometry baker with
// the exact Node runtime bundled by the supported game; never starts its game.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <string>
#include <vector>
#include <cstdio>

static std::string utf8(const wchar_t* text) {
    const int size = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, text, -1, nullptr, 0, nullptr, nullptr);
    if (!size) return {};
    std::string result(static_cast<size_t>(size), '\0');
    WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, text, -1, result.data(), size, nullptr, nullptr);
    result.pop_back();
    return result;
}
int wmain(int argc, wchar_t** argv) {
    if (argc < 3) { std::fputs("Expected supported game directory and mod script.\n", stderr); return 2; }
    SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX);
    if (!SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32 | LOAD_LIBRARY_SEARCH_USER_DIRS) ||
        !AddDllDirectory(argv[1])) return 3;
    const std::wstring dll = std::wstring(argv[1]) + L"\\node.dll";
    HMODULE module = LoadLibraryExW(dll.c_str(), nullptr,
        LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
    if (!module) { std::fprintf(stderr, "Cannot load supported runtime (%lu).\n", GetLastError()); return 4; }
    using Start = int (__cdecl*)(int, char**);
    auto start = reinterpret_cast<Start>(GetProcAddress(module, "?Start@node@@YAHHQEAPEAD@Z"));
    if (!start) { std::fputs("Supported runtime entry point is unavailable.\n", stderr); return 5; }
    std::vector<std::string> values = {"WendyQuestInstallRuntime", "--max-old-space-size=128"};
    for (int i = 2; i < argc; ++i) values.push_back(utf8(argv[i]));
    std::vector<char*> args;
    for (auto& value : values) args.push_back(value.data());
    return start(static_cast<int>(args.size()), args.data());
}
