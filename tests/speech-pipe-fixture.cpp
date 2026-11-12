#include "../src/services/windows/speech-pipe.hpp"

namespace {

// A controlled stand-in for provider operations which may block even after
// the game has closed admission. Each start is observable before it returns.
bool hold(char marker) {
    return wqa::reply(marker) && std::getchar() == 'K' && std::getchar() == '\n';
}

struct Provider {
    bool open() { return hold('I'); }
    bool output(const char*, bool interrupt) { return hold(interrupt ? 'O' : 'A'); }
};

} // namespace

int main() {
    Provider provider;
    return wqa::serveSpeech(provider);
}
