#pragma once

#include <array>
#include <cstdio>
#include <cstring>

namespace wqa {

inline bool reply(char code) {
    return std::putchar(code) != EOF && std::putchar('\n') != EOF && std::fflush(stdout) == 0;
}

// The renderer can retire a packet while the helper is reading it or while
// provider initialization is running. Ask again after each boundary.
enum class Grant { denied, accepted, end, invalid };

inline Grant requestGrant(char phase) {
    if (!reply(phase)) return Grant::end;
    std::array<char, 4> response{};
    if (!std::fgets(response.data(), static_cast<int>(response.size()), stdin)) return Grant::end;
    if (response[1] != '\n' || response[2] != '\0') return Grant::invalid;
    if (response[0] == 'Y') return Grant::accepted;
    if (response[0] == 'N') return Grant::denied;
    return Grant::invalid;
}

template <typename Speech>
int serveSpeech(Speech& speech) {
    if (!reply('R')) return 4;
    bool opened = false;
    // At most 512 UTF-16 units, up to three UTF-8 bytes per unit, plus framing.
    std::array<char, 1600> line{};
    while (std::fgets(line.data(), static_cast<int>(line.size()), stdin)) {
        const auto length = std::strlen(line.data());
        if (length < 3 || line[length - 1] != '\n' || (line[0] != 'S' && line[0] != 'A')) return 5;
        line[length - 1] = '\0';
        auto grant = requestGrant('P');
        if (grant == Grant::accepted && !opened) {
            if (!speech.open()) return 3;
            opened = true;
            grant = requestGrant('B');
        }
        if (grant == Grant::end) break;
        if (grant == Grant::invalid) return 5;
        if (grant == Grant::denied) {
            if (!reply('D')) break;
            continue;
        }
        if (!speech.output(line.data() + 1, line[0] == 'S')) return 6;
        if (!reply('S')) break;
    }
    return 0;
}

} // namespace wqa
