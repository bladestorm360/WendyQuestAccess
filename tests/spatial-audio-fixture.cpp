#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#define SDL_MAIN_HANDLED
#define WQA_AUDIO_TEST
#include "../src/services/windows/audio-device.hpp"
#include "../src/services/windows/audio-hrtf.hpp"
#include <cassert>
#include <chrono>
#include <cstdio>
#include <thread>

using namespace wqa::audio;

int crossings(const Stereo& pcm, int channel) {
    int count = 0;
    for (int i = 400; i < 3000; ++i) {
        if (pcm[i * 2 + channel] > 0 && pcm[(i - 1) * 2 + channel] <= 0) count++;
    }
    return count;
}

int64_t energy(const Stereo& pcm, int channel) {
    int64_t result = 0;
    for (size_t i = static_cast<size_t>(channel); i < pcm.size(); i += 2) {
        const int32_t sample = pcm[i];
        result += sample * sample;
    }
    return result;
}

int wmain(int argc, wchar_t** argv) {
    assert(argc == 2);
    const std::wstring root(argv[1]);
    const auto ready = [] { return true; };
    Stereo front{}, rear{}, left{}, right{}, up{};
    assert(stereo_preview(front, {0, 0, 1}, 0.7, ready));
    assert(stereo_preview(rear, {0, 0, -1}, 0.7, ready));
    const auto front_crossings = crossings(front, 0);
    const auto rear_crossings = crossings(rear, 0);
    assert(front_crossings > rear_crossings);
    assert(energy(front, 0) == energy(front, 1) && energy(rear, 0) == energy(rear, 1));
    assert(stereo_preview(left, {-1, 0, 0}, 0.7, ready));
    assert(stereo_preview(right, {1, 0, 0}, 0.7, ready));
    assert(energy(left, 1) == 0 && energy(right, 0) == 0);
    assert(crossings(left, 0) == front_crossings && crossings(right, 1) == front_crossings);
    for (int i = -15; i <= 15; ++i) {
        const double angle = tau * i / 64.0;
        Stereo test{};
        assert(stereo_preview(test, {std::sin(angle), 0, -std::cos(angle)}, 0.7, ready));
        assert(crossings(test, i < 0 ? 0 : 1) == rear_crossings);
    }
    int polls = 0;
    assert(!stereo_preview(up, {0, 1, 0}, 0.7, [&] { return ++polls < 4; }));
    assert(polls == 4);

    Hrtf hrtf;
    const auto begin = std::chrono::steady_clock::now();
    assert(hrtf.open(root + L"\\soft_oal.dll", ready));
    const auto initialized = std::chrono::steady_clock::now();
    assert(hrtf.render(front, {0, 0, 1}, 0.7, ready));
    assert(hrtf.render(rear, {0, 0, -1}, 0.7, ready));
    assert(hrtf.render(left, {-1, 0, 0}, 0.7, ready));
    assert(hrtf.render(right, {1, 0, 0}, 0.7, ready));
    assert(hrtf.render(up, {0, 1, 0}, 0.7, ready));
    const auto rendered = std::chrono::steady_clock::now();
    assert(front != rear && front != up);
    assert(energy(left, 0) > energy(left, 1) && energy(right, 1) > energy(right, 0));
    polls = 0;
    assert(!hrtf.render(up, {0, 1, 0}, 0.7, [&] { return ++polls < 6; }));
    assert(polls == 6);

    // The build runner sets SDL_AUDIO_DRIVER=dummy for this process only.
    // The real SDL driver callback consumes the pre-rendered PCM.
    volatile LONG generation = 1;
    Device device(&generation);
    assert(device.open(root + L"\\SDL3.dll", 1));
    assert(!device.publish(2, left));
    assert(device.publish(1, left));
    for (int i = 0; i < 40 && device.submitted() == 0; ++i) std::this_thread::sleep_for(std::chrono::milliseconds(5));
    assert(device.submitted() > 0);
    InterlockedExchange(&generation, 0);
    std::this_thread::sleep_for(std::chrono::milliseconds(25));
    const auto stopped = device.submitted();
    std::this_thread::sleep_for(std::chrono::milliseconds(25));
    assert(device.submitted() == stopped && !device.publish(1, right));
    InterlockedExchange(&generation, 2);
    assert(device.publish(2, right));
    for (int i = 0; i < 40 && device.submitted() == stopped; ++i) std::this_thread::sleep_for(std::chrono::milliseconds(5));
    assert(device.submitted() > stopped);
    std::printf("Verified built-in HRTF, full rear-pitch fallback and SDL dummy output generation. Loopback init %.1f ms, five cues %.1f ms.\n",
        std::chrono::duration<double, std::milli>(initialized - begin).count(),
        std::chrono::duration<double, std::milli>(rendered - initialized).count());
}
