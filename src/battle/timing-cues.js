'use strict';

const { battlePresented, visibleSprite } = require('./presentation');

const MAX_REQUEST_MS = 48;
const SOURCE = 'battleTiming';
const HIT_NOTE_PITCH = 1;

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
        if (!owner.open) return;
        owner.open = false;
        audio.retire(scene, SOURCE);
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
            owner = { scene, action, phase: 0, emitted: false, open: false };
            scene._wqaBattleCueActive = action._wqaBattleCueActive = true;
        },
        sample(scene, action, phase, progress, start, end, limit, blocked) {
            const current = owner;
            if (current?.scene !== scene || current.action !== action || (phase !== 0 && phase !== 1) || phase < current.phase) return;
            if (current.phase !== phase) {
                endSweep(scene, action);
                current.phase = phase;
                current.emitted = false;
            }
            // These are the bounds used by the native perfect-hit and failure
            // branches. A confirm already handled on this frame owns the result.
            if (blocked || !(start < end && progress >= start && progress <= end && progress < limit && progress < 1)) {
                endSweep(scene, action);
                return;
            }
            // Wobble may leave and re-enter the band. A phase gets one note.
            if (current.emitted) return;
            const config = enabled();
            if (!config || !ready(scene, action)) return retire(scene);
            current.emitted = current.open = true;
            const cue = phase === 0 ? audio.cues.battlePower : audio.cues.battleAccuracy;
            const expires = host.now() + MAX_REQUEST_MS;
            audio.play(scene, config.hrtf, cue, config.battleTimingVolume / 100,
                [0, 0, 1],
                () => owner === current && current.phase === phase && current.open &&
                    host.now() < expires && ready(scene, action), undefined, SOURCE, HIT_NOTE_PITCH);
        },
        endSweep,
        retire
    };
}

module.exports = { createBattleCues, HIT_NOTE_PITCH };