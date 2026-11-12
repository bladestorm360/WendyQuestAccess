'use strict';

const { battlePresented, visibleSprite } = require('./presentation');

// The earlier tone lets the player anticipate the tap tone. The tap tone is
// requested shortly before the center to allow for a native frame and audio
// submission. Both offsets are checked in the timed fixture and gameplay.
const LEAD_SECONDS = 0.19;
const TAP_SECONDS = 0.034;
const MAX_REQUEST_MS = 90;
const SOURCE = 'battleTiming';

function secondsTo(progress, target, duration, slowStart, slowEnd) {
    if (target <= progress) return 0;
    const slow = Math.max(0, Math.min(target, slowEnd) - Math.max(progress, slowStart));
    return (target - progress + slow) * duration;
}

function timingWindow(start, end, limit, iceStart, iceEnd) {
    if (iceStart >= 0) return [Math.max(0, iceStart), Math.min(iceEnd, limit)];
    if (start < Math.min(end, limit)) return [Math.max(0, start), Math.min(end, limit)];
    // The game can show a sweep without a highlighted success band. Use its
    // last safe visible approach as a timing reference in that case.
    return [Math.max(0, limit - 0.08), limit];
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
        sample(scene, action, phase, progress, duration, start, end, limit, iceStart, iceEnd, paused, frosty, accepted) {
            const current = owner;
            if (current?.scene !== scene || current.action !== action) return;
            if (accepted || paused || (phase !== 0 && phase !== 1) || !(progress >= 0 && progress <= 1) ||
                !(duration > 0 && duration <= 4) || !(limit > 0 && limit <= 1)) {
                if (current.window) endSweep(scene, action);
                return;
            }
            const ice = iceStart >= 0;
            const kind = ice ? audio.cues.battleIce : phase === 0 ? audio.cues.battlePower : audio.cues.battleAccuracy;
            let window = current.window;
            if (window?.kind !== kind) {
                if (window) endSweep(scene, action);
                const [lower, upper] = timingWindow(start, end, limit, iceStart, iceEnd);
                if (!(upper > lower)) return;
                window = current.window = { kind, center: (lower + upper) / 2, upper, stage: 0 };
            }
            if (progress >= window.upper) {
                if (window.stage !== 3) audio.retire(scene, SOURCE);
                window.stage = 3;
                return;
            }
            if (window.stage >= 2) return;
            const slow = frosty && end > start;
            const slowStart = slow ? start : 0;
            const slowEnd = slow ? end : 0;
            const remaining = secondsTo(progress, window.center, duration, slowStart, slowEnd);
            if (remaining > LEAD_SECONDS || (window.stage === 1 && remaining > TAP_SECONDS)) return;
            const config = enabled();
            if (!config || !ready(scene, action)) return retire(scene);
            const tap = remaining <= TAP_SECONDS;
            window.stage = tap ? 2 : 1;
            const expires = host.now() + Math.min(MAX_REQUEST_MS,
                secondsTo(progress, window.upper, duration, slowStart, slowEnd) * 1000);
            const angle = Math.PI * (phase === 0 ? 1 + window.center : 2 - window.center);
            audio.play(scene, config.hrtf, tap ? kind : audio.cues.battleLead, config.battleTimingVolume / 100,
                [Math.cos(angle), -Math.sin(angle), 1],
                () => owner === current && current.window === window && window.stage < 3 &&
                    host.now() < expires && ready(scene, action), undefined, SOURCE);
        },
        endSweep,
        retire
    };
}

module.exports = { createBattleCues };