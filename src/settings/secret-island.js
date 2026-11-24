'use strict';

const { automaticCaveMap } = require('../world/puzzles/cave-progression');

function secretIslandAvailable(root, scene) {
    const map = root.$gameMap?._mapId;
    return !!scene?._wqaMapRestored && !scene._wqaBattleStarted &&
        scene === root.SceneManager?._scene && (map === 206 || automaticCaveMap(map));
}

// Keep the existing audio/navigation profile keys: moving a control does not
// reset timing, volume or any other saved preference during an update.
function createSecretIslandMenu(root, host) {
    function show(owner, selection = 'automatic') {
        if (!secretIslandAvailable(root, owner.scene)) return host.back(owner);
        host.stop(owner.scene);
        owner.group = 'secretIsland';
        owner.selected = selection;
        owner.capture = null;
        owner.heading.textContent = 'Secret Island';
        owner.status.textContent = host.loading() ? 'Loading settings' : '';
        owner.contents.textContent = '';
        const audio = host.audio(), navigation = host.navigation();
        const items = {
            automatic: host.button(owner, `Automatic interactions, ${navigation.caveAutomaticInteractions ? 'on' : 'off'}`, () =>
                host.change(owner, {...host.navigation(),caveAutomaticInteractions:!host.navigation().caveAutomaticInteractions}, 'automatic', 'navigation')),
            caveTiming: host.button(owner, `Cave timing assist, ${audio.caveTiming ? 'on' : 'off'}`, () =>
                host.change(owner, {...host.audio(),caveTiming:!host.audio().caveTiming}, 'caveTiming', 'audio')),
            caveLower: host.button(owner, `Decrease cave timing volume, ${audio.caveVolume} percent`, () =>
                host.change(owner, {...host.audio(),caveVolume:Math.max(0,host.audio().caveVolume-10)}, 'caveLower', 'audio')),
            caveRaise: host.button(owner, `Increase cave timing volume, ${audio.caveVolume} percent`, () =>
                host.change(owner, {...host.audio(),caveVolume:Math.min(100,host.audio().caveVolume+10)}, 'caveRaise', 'audio')),
            preview: host.button(owner, 'Preview cave crossing ping', () => host.preview(owner, audio.caveVolume / 100)),
            help: host.button(owner, 'How to use the cave solver', () => host.status(owner,
                `Turn on Autowalk and Automatic interactions, then press ${host.guideKey()} to collect the cave pickups and complete the route. Press ${host.stopKey()} to stop. With Automatic interactions off, current cave assistance is unchanged.`))
        };
        items.automatic.setAttribute('aria-pressed',String(navigation.caveAutomaticInteractions));
        items.caveTiming.setAttribute('aria-pressed',String(audio.caveTiming));
        host.button(owner, 'Back', () => host.back(owner));
        (items[selection] || items.automatic).focus();
    }
    return {show};
}

module.exports = {createSecretIslandMenu,secretIslandAvailable};
