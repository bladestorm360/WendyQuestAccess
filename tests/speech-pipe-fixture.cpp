#include "../src/services/windows/speech-pipe.hpp"

namespace {

// A controlled stand-in for provider operations which may block even after
// the game has closed admission. Each start is observable before it returns.
bool hold(char marker) {
    return wqa::reply(marker) && std::getchar() == 'K' && std::getchar() == '\n';
}

struct Provider {
    bool available;
    bool open() { return hold('I'); }
    bool hasBraille() const { return available; }
    bool output(const char*, bool interrupt) { return hold(interrupt ? 'O' : 'A'); }
    bool braille(const char*) { return available && hold('L'); }
    bool stop() { return available && hold('X'); }
};

} // namespace

int main(int argc, char**) {
    Provider provider{argc == 1};
    return wqa::serveSpeech(provider);
}
