'use strict';

const { battlePresented, visibleSprite } = require('./presentation');

// Each pulse represents the latest visible position. Keep the same rhythm
// and waveform through the target, with no separately scheduled hit note.
const PULSE_INTERVAL_MS = 65;
const MAX_REQUEST_MS = 48;
const SOURCE = 'battleTiming';

function sweepPitch(progress, start, end, limit, ice) {
    // An end band, or a meter without a band, rises to the native cutoff.
    // An interior band shapes the pitch around its midpoint.
    const upper = Math.min(end, limit);
    const lower = Math.max(0, start);
    const peak = upper > lower && (ice || upper < limit) ? (lower + upper) / 2 : limit;
    const height = progress <= peak ? progress / peak : (limit - progress) / (limit - peak);
    return 0.75 + 0.5 * Math.max(0, Math.min(1, height));
}

function createBattleCues(root, host, audio, preferences) {
    let owner = null;

    function enabled() {
        const config = preferences();
        return config.enabled && config.battleTiming && config.battleTimingVolume > 0 ? config : null;
    }

    function ready(scene, action) {
        const battle = root.BattleManager;
        if (!battlePresented(root, host, scene)) return false;
        if (!action) return battle._phase === 'input' ||
            (battle._phase === 'ActionCommand' && battle._currentActionCommand?._wqaTimingWaiting);
        return battle._phase === 'ActionCommand' && battle._currentActionCommand === action &&
            action._spriteBase?.parent === scene && visibleSprite(action._spriteBase, action._backing);
    }

    function retire(scene) {
        if (!owner || (scene && owner.scene !== scene)) return;
        audio.retire(owner.scene, SOURCE);
        owner.scene._wqaBattleCueActive = false;
        if (owner.action) owner.action._wqaBattleCueActive = false;
        owner = null;
    }

    function endSweep(scene, action) {
        if (owner?.scene !== scene || owner.action !== action) return;
        audio.retire(scene, SOURCE);
        owner.window = null;
    }

    return {
        prepare(scene) {
            const config = enabled();
            if (!config || audio.isPrepared(config.hrtf) || owner?.scene === scene || !ready(scene)) return;
            if (owner) retire(owner.scene);
            const prep = owner = { scene, action: null };
            scene._wqaBattleCueActive = true;
            const started = audio.prepare(scene, config.hrtf, () => owner === prep && ready(scene), () => {
                if (owner === prep) retire(scene);
            }, SOURCE);
            if (!started && owner === prep) retire(scene);
        },
        begin(scene, action) {
            const config = enabled();
            if (owner) retire(owner.scene);
            if (!config || !audio.isPrepared(config.hrtf) || !ready(scene, action)) return;
            owner = { scene, action, window: null };
            scene._wqaBattleCueActive = action._wqaBattleCueActive = true;
        },
        sample(scene, action, phase, progress, duration, start, end, limit, iceStart, iceEnd, paused, _frosty, accepted) {
            const current = owner;
            if (current?.scene !== scene || current.action !== action) return;
            if (accepted || paused || (phase !== 0 && phase !== 1) || !(progress >= 0 && progress <= 1) ||
                !(duration > 0 && duration <= 4) || !(limit > 0 && limit <= 1)) {
                if (current.window) endSweep(scene, action);
                return;
            }
            const ice = iceStart >= 0;
            const cutoff = ice ? Math.min(iceEnd, limit) : limit;
            if (!(progress < cutoff)) {
                if (current.window) endSweep(scene, action);
                return;
            }
            let window = current.window;
            if (window?.phase !== phase || window.ice !== ice) {
                if (window) endSweep(scene, action);
                window = current.window = { phase, ice, next: 0 };
            }
            const now = host.now();
            if (now < window.next) return;
            const config = enabled();
            if (!config || !ready(scene, action)) return retire(scene);
            window.next = now + PULSE_INTERVAL_MS;
            const pitch = sweepPitch(progress, ice ? iceStart : start, ice ? iceEnd : end, cutoff, ice);
            const angle = Math.PI * (phase === 0 ? 1 + progress : 2 - progress);
            const cue = phase === 0 ? audio.cues.battlePower : audio.cues.battleAccuracy;
            const expires = now + MAX_REQUEST_MS;
            audio.play(scene, config.hrtf, cue, config.battleTimingVolume / 100,
                [Math.cos(angle), -Math.sin(angle), 1],
                () => owner === current && current.window === window &&
                    host.now() < expires && ready(scene, action), undefined, SOURCE, pitch);
        },
        endSweep,
        retire
    };
}

module.exports = { createBattleCues };