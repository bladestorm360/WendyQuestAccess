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
    assert(stereo_cue(front, Cue::preview, {0, 0, 1}, 0.7, ready));
    assert(stereo_cue(rear, Cue::preview, {0, 0, -1}, 0.7, ready));
    const auto front_crossings = crossings(front, 0);
    const auto rear_crossings = crossings(rear, 0);
    assert(front_crossings > rear_crossings);
    assert(energy(front, 0) == energy(front, 1) && energy(rear, 0) == energy(rear, 1));
    assert(stereo_cue(left, Cue::preview, {-1, 0, 0}, 0.7, ready));
    assert(stereo_cue(right, Cue::preview, {1, 0, 0}, 0.7, ready));
    assert(energy(left, 1) == 0 && energy(right, 0) == 0);
    assert(crossings(left, 0) == front_crossings && crossings(right, 1) == front_crossings);
    for (int i = -15; i <= 15; ++i) {
        const double angle = tau * i / 64.0;
        Stereo test{};
        assert(stereo_cue(test, Cue::preview, {std::sin(angle), 0, -std::cos(angle)}, 0.7, ready));
        assert(crossings(test, i < 0 ? 0 : 1) == rear_crossings);
    }
    int polls = 0;
    assert(!stereo_cue(up, Cue::preview, {0, 1, 0}, 0.7, [&] { return ++polls < 4; }));
    assert(polls == 4);

    Hrtf hrtf;
    const auto begin = std::chrono::steady_clock::now();
    assert(hrtf.open(root + L"\\soft_oal.dll", ready));
    const auto initialized = std::chrono::steady_clock::now();
    assert(hrtf.render(front, Cue::preview, {0, 0, 1}, 0.7, ready));
    assert(hrtf.render(rear, Cue::preview, {0, 0, -1}, 0.7, ready));
    assert(hrtf.render(left, Cue::preview, {-1, 0, 0}, 0.7, ready));
    assert(hrtf.render(right, Cue::preview, {1, 0, 0}, 0.7, ready));
    assert(hrtf.render(up, Cue::preview, {0, 1, 0}, 0.7, ready));
    const auto rendered = std::chrono::steady_clock::now();
    assert(front != rear && front != up);
    assert(energy(left, 0) > energy(left, 1) && energy(right, 1) > energy(right, 0));
    polls = 0;
    assert(!hrtf.render(up, Cue::preview, {0, 1, 0}, 0.7, [&] { return ++polls < 6; }));
    assert(polls == 6);
    Stereo bump{}, brush{}, rear_bump{}, rear_brush{};
    assert(hrtf.render(bump, Cue::wall_bump, {0, 0, 1}, 0.7, ready));
    assert(hrtf.render(brush, Cue::wall_brush, {0, 0, 1}, 0.7, ready));
    assert(energy(bump, 0) > 0 && energy(brush, 0) > 0 && bump != brush);
    assert(stereo_cue(bump, Cue::wall_bump, {0, 0, 1}, 0.7, ready));
    assert(stereo_cue(brush, Cue::wall_brush, {0, 0, 1}, 0.7, ready));
    assert(stereo_cue(rear_bump, Cue::wall_bump, {0, 0, -1}, 0.7, ready));
    assert(stereo_cue(rear_brush, Cue::wall_brush, {0, 0, -1}, 0.7, ready));
    assert(crossings(rear_bump, 0) < crossings(bump, 0) && crossings(rear_brush, 0) < crossings(brush, 0));
    Stereo pulse{}, turn{}, arrival{};
    assert(hrtf.render(pulse, Cue::beacon_pulse, {-1, 0, 0}, 0.7, ready));
    assert(hrtf.render(turn, Cue::beacon_turn, {1, 0, 0}, 0.7, ready));
    assert(hrtf.render(arrival, Cue::beacon_arrival, {0, 0, 1}, 0.7, ready));
    assert(energy(pulse, 0) > energy(pulse, 1) && energy(turn, 1) > energy(turn, 0) && energy(arrival, 0) > 0);
    assert(pulse != turn && turn != arrival && arrival != pulse);
    assert(stereo_cue(turn, Cue::beacon_turn, {0, 0, 1}, 0.7, ready));
    assert(stereo_cue(pulse, Cue::beacon_turn, {0, 0, -1}, 0.7, ready));
    assert(crossings(pulse, 0) < crossings(turn, 0));
    Stereo go{}, behind_go{};
    assert(hrtf.render(go, Cue::cave_go, {-1, 0, 0}, 0.7, ready));
    assert(energy(go, 0) > energy(go, 1) && go != arrival);
    assert(stereo_cue(go, Cue::cave_go, {0, 0, 1}, 0.7, ready));
    assert(stereo_cue(behind_go, Cue::cave_go, {0, 0, -1}, 0.7, ready));
    assert(crossings(behind_go, 0) < crossings(go, 0));

    std::array<Stereo, 7> entity_cues{};
    for (size_t i = 0; i < entity_cues.size(); ++i) {
        const auto cue = static_cast<Cue>(static_cast<int>(Cue::entity_person) + i);
        Stereo back{}, spatial{};
        auto& ahead = entity_cues[i];
        assert(stereo_cue(ahead, cue, {0, 0, 1}, 0.5, ready));
        assert(stereo_cue(back, cue, {0, 0, -1}, 0.5, ready));
        assert(energy(ahead, 0) > 0 && crossings(back, 0) < crossings(ahead, 0));
        for (size_t earlier = 0; earlier < i; ++earlier) assert(entity_cues[earlier] != ahead);
        assert(hrtf.render(spatial, cue, {-1, 0, 0}, 0.5, ready));
        assert(energy(spatial, 0) > energy(spatial, 1));
    }

    std::array<Stereo, 4> battle_cues{};
    for (size_t i = 0; i < battle_cues.size(); ++i) {
        const auto cue = static_cast<Cue>(static_cast<int>(Cue::battle_lead) + i);
        Stereo spatial{}, back{};
        auto& ahead = battle_cues[i];
        assert(stereo_cue(ahead, cue, {0, 0, 1}, 0.65, ready));
        assert(stereo_cue(back, cue, {0, 0, -1}, 0.65, ready));
        assert(energy(ahead, 0) > 0 && crossings(back, 0) < crossings(ahead, 0));
        assert(hrtf.render(spatial, cue, {1, 0.2, 1}, 0.65, ready));
        assert(energy(spatial, 1) > energy(spatial, 0));
        for (size_t earlier = 0; earlier < i; ++earlier) assert(battle_cues[earlier] != ahead);
    }

    // The meter's approach notes change pitch through each output path.
    for (const bool spatial : {false, true}) {
        Stereo low{}, high{};
        const Bearing forward{0, 0, 1};
        if (spatial) {
            assert(hrtf.render(low, Cue::battle_lead, forward, 0.65, ready, 0.85));
            assert(hrtf.render(high, Cue::battle_lead, forward, 0.65, ready, 1.13));
        } else {
            assert(stereo_cue(low, Cue::battle_lead, forward, 0.65, ready, 0.85));
            assert(stereo_cue(high, Cue::battle_lead, forward, 0.65, ready, 1.13));
        }
        const auto rising = [](const Stereo& pcm) {
            int count = 0;
            for (int i = 600; i < 1400; ++i)
                if (pcm[i * 2] > 0 && pcm[(i - 1) * 2] <= 0) count++;
            return count;
        };
        assert(rising(high) > rising(low));
    }

    // The build runner sets SDL_AUDIO_DRIVER=dummy for this process only.
    // The real SDL driver callback consumes the pre-rendered PCM.
    volatile LONG generation[4] = {1, 0, 0, 0};
    Device device(generation);
    assert(device.open(root + L"\\SDL3.dll", 1));
    std::this_thread::sleep_for(std::chrono::milliseconds(20));
    assert(device.callbacks() == 0);
    assert(!device.publish(2, left));
    assert(device.publish(1, left));
    for (int i = 0; i < 40 && device.submitted() == 0; ++i) std::this_thread::sleep_for(std::chrono::milliseconds(5));
    assert(device.submitted() > 0);
    InterlockedExchange(generation, 0);
    std::this_thread::sleep_for(std::chrono::milliseconds(25));
    const auto stopped = device.submitted();
    const auto revoked = device.callbacks();
    std::this_thread::sleep_for(std::chrono::milliseconds(25));
    assert(device.submitted() == stopped && device.callbacks() == revoked && !device.publish(1, right));
    InterlockedExchange(generation, 2);
    assert(device.publish(2, battle_cues.back()));
    for (int i = 0; i < 40 && device.submitted() == stopped; ++i) std::this_thread::sleep_for(std::chrono::milliseconds(5));
    assert(device.submitted() > stopped);
    for (int i = 0; i < 80 && device.submitted() < stopped + render_frames; ++i)
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    assert(device.submitted() == stopped + render_frames);
    const auto completed = device.callbacks();
    std::this_thread::sleep_for(std::chrono::milliseconds(25));
    assert(device.callbacks() == completed);
    Stereo wall{}, foot{};
    assert(stereo_cue(wall, Cue::wall_tone, {0, 0, -1}, 0.55, ready));
    assert(stereo_cue(foot, Cue::footstep, {0, -1, 0.15}, 0.55, ready));
    assert(energy(foot, 0) > 0 && foot != wall);
    assert(hrtf.render(up, Cue::footstep, {-1, -0.2, 0}, 0.55, ready));
    assert(energy(up, 0) > energy(up, 1));
    constexpr int click_frames = rate * footstep_ms / 1000;
    const auto tail = [](const Stereo& pcm, int frames) {
        return std::all_of(pcm.begin() + frames * 2, pcm.end(), [](auto value) { return value == 0; });
    };
    assert(tail(foot, click_frames));
    Stereo rear_foot{};
    assert(stereo_cue(rear_foot, Cue::footstep, {0, 0, -1}, 0.55, ready));
    assert(!tail(rear_foot, click_frames));
    assert(tail(rear_foot, static_cast<int>(std::ceil(click_frames / rear_pitch))));
    int changes = 0;
    for (int i = 16; i < click_frames; i += 4)
        if ((cue_sample(Cue::footstep, i, 1.0) < 0) != (cue_sample(Cue::footstep, i - 4, 1.0) < 0)) ++changes;
    assert(changes > 90);
    for (const bool spatial : {false, true}) {
        if (spatial) assert(hrtf.render(wall, Cue::wall_tone, {1, 0, 0}, 0.55, ready));
        // A seam is one normal sample-to-sample step, including the
        // filter history in the HRTF path.
        for (int channel = 0; channel < 2; ++channel) {
            const auto seam = std::abs(wall[channel] - wall[2 * (cue_frames - 1) + channel]);
            int steepest = 0;
            for (int i = 1; i < cue_frames; ++i)
                steepest = std::max(steepest, std::abs(wall[2 * i + channel] - wall[2 * (i - 1) + channel]));
            assert(seam <= steepest + 8);
        }
    }
    // Check the exact gain curve used by the callback independently of SDL
    // buffer scheduling. An extended deadline must recover without a jump.
    static_assert(wall_fade_frames == 24000);
    int level = wall_fade_frames;
    assert(wall_level(level, rate) == level);
    for (int remaining = wall_fade_frames; remaining >= 0; --remaining) {
        level = wall_level(level, remaining);
        assert(level == remaining);
    }
    level = wall_fade_frames / 4;
    const int raised = wall_level(level, rate * 3);
    assert(raised > level && raised - level == wall_attack_step);
    for (int i = 0; i < 256; ++i) level = wall_level(level, rate * 3 - i);
    assert(level == wall_fade_frames);

    InterlockedExchange(generation + 3, static_cast<LONG>(unix_ms() + 650));
    InterlockedExchange(generation + wall_lane, 3);
    assert(device.publish(3, wall, wall_lane));
    const int beforeLoop = device.submitted();
    std::this_thread::sleep_for(std::chrono::milliseconds(160));
    assert(device.submitted() - beforeLoop > cue_frames);
    InterlockedExchange(generation + 2, 4);
    assert(device.publish(4, foot, 2));
    std::this_thread::sleep_for(std::chrono::milliseconds(550));
    const auto expired = device.callbacks();
    std::this_thread::sleep_for(std::chrono::milliseconds(25));
    assert(device.callbacks() == expired);
    std::puts("Verified the 25 ms footstep noise click, HRTF placement, and stereo rear pitch.");
    std::puts("Verified periodic stereo/HRTF seams, concurrent footstep and wall voices, the 500 ms wall fade and independent expiry.");
    std::printf("Verified built-in HRTF, full rear-pitch fallback and SDL dummy output generation. Loopback init %.1f ms, five cues %.1f ms.\n",
        std::chrono::duration<double, std::milli>(initialized - begin).count(),
        std::chrono::duration<double, std::milli>(rendered - initialized).count());
}
