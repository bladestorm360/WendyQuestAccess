'use strict';

const { sharedCaveArea } = require('./shared-caves');

// Native transfer destinations with empty display names. Floor and house
// numbers distinguish locations without naming occupants or rewards.
const LOCAL_NAMES = Object.freeze({
    17: 'Salt Caverns entrance', 20: 'Salt Caverns exit', 28: 'Cauldron of Sauce',
    32: 'Cauldron of Sauce', 33: 'Chillcrest cave', 35: 'Float Fort cave',
    37: 'Frosty Peak cave', 44: 'Cauldron of Sauce', 48: 'Caves', 49: 'Breaded Bay',
    50: 'Cauldron of Sauce', 51: 'Cauldron room 1', 53: 'Cauldron room 2',
    55: 'Cauldron room 3', 60: 'Oasis', 61: 'Cave entrance', 62: 'Lava River',
    63: 'Cauldron chamber', 98: 'Elevator, lower landing', 107: 'Arena', 113: 'World map',
    116: "Elder Tater's house", 117: "Frygor's house, first floor", 118: "Frygor's house, second floor",
    119: "Frostyna's house", 120: 'Russetwood workshop, first floor', 121: 'Russetwood house 1',
    122: 'Russetwood workshop, second floor', 123: 'Russetwood house 2', 124: 'Russetwood house 3',
    125: 'Russetwood house 4', 126: "Elder Frosty's house, first floor",
    127: "Elder Frosty's house, second floor", 128: "Elder Frosty's house, third floor",
    129: 'Chillcrest house 1', 130: 'Chillcrest house 2', 131: 'Chillcrest house 3',
    132: 'Float Fort house, first floor', 133: 'Float Fort house, second floor', 134: 'Mech Café',
    135: 'Breaded Bay house', 136: 'Caves house', 137: 'Oasis house', 138: 'Lava River house',
    139: 'Nuggedor house 1', 140: 'Burgenburg house 2', 141: 'Nuggedor house 3',
    142: 'Burgenburg house 1', 143: 'Nuggedor house 5', 144: 'Burgenburg house 3',
    145: 'Nuggedor house 7', 146: 'Sunrise Bay house 1', 147: 'Sunrise Bay house 2',
    148: 'Sunrise Bay house 3', 149: 'Sunrise Bay shop 1', 150: 'Sunrise Bay shop 2',
    151: 'Sunrise Bay shop 3', 152: 'Scrambled Shores house', 153: 'Bacon Beach house',
    154: 'Nuggedor house 2', 155: 'Nuggedor house 4', 156: 'Nuggedor house 6',
    157: "Baconator's house, first floor", 158: "Baconator's house, second floor",
    159: 'Patty Pit house 1', 160: 'Patty Pit house 2',
    181: "Wendy's, Russetwood", 182: "Wendy's, Chillcrest", 183: "Wendy's, Nuggedor",
    184: "Wendy's, Burgenburg", 186: "Wendy's, Sunrise Bay",
    193: 'Elevator, upper landing', 194: 'Elevator', 195: "Elder Frosty's house, third floor",
    203: 'Float Fort house, second floor', 204: 'Cold Brew Trail cave', 205: 'Cave',
    206: 'Island', 207: 'Island', 208: 'Island', 209: 'Nugget Mine entrance'
});

// Share the already established interior numbers with each town entrance.
function numberedHouseName(id) {
    const name=LOCAL_NAMES[id];
    return / house [1-9]\d*$/.test(name || '') ? name : '';
}

function mapPlace(root) {
    const id = root.$gameMap?._mapId;
    if(id===48&&sharedCaveArea(root)>0)return 'Nugget Mines';
    const name = root.$dataMap?.displayName;
    return typeof name === 'string' && name.length <= 240 && name.trim() || LOCAL_NAMES[id] || '';
}

// The installed MapScene publishes a draw revision after its bitmap work.
// Keep this observation attached to that presentation until its native end.
function createMapBannerObserver(root, host, notifications, fieldReady) {
    let current = null;
    let lastMap = null;
    let lastId = null;

    function markPlace() {
        lastMap = root.$gameMap;
        lastId = lastMap?._mapId;
    }

    function entrance(scene) {
        if (scene._wqaEntryNamed || !fieldReady(scene, true) ||
            (root.$gameMap === lastMap && root.$gameMap?._mapId === lastId && !scene._transfer)) return;
        const renderer = host.graphics.app?.renderer;
        if (typeof renderer?.once !== 'function') return;
        renderer.once('postrender', () => {
            if (scene._wqaEntryNamed || !fieldReady(scene, true)) return;
            const name = mapPlace(root);
            if (!name) return;
            if (current) leave(current.scene);
            markPlace();
            scene._wqaEntranceFallback = scene._wqaEntryNamed = true;
            const context = current = { scene, epoch: 0, fallback: true };
            scene._wqaMapAnnouncement = -1;
            scene._wqaPresentation = true;
            context.epoch = notifications.open({ kind: 'mapBanner', name, entering: true },
                () => current === context && fieldReady(scene, true));
            if (!context.epoch) leave(scene);
        });
    }

    function leave(scene) {
        if (current?.scene !== scene) return;
        const epoch = current.epoch;
        current = null;
        scene._wqaMapAnnouncement = 0;
        if (epoch) notifications.close(epoch);
    }

    function ready(context) {
        const { scene, window, revision } = context;
        return current === context && host.hasFocus() && scene === host.manager._scene &&
            !host.manager._nextScene && !host.manager._exiting && !host.graphics._wqaResize &&
            host.graphics.app?.stage === scene && scene._active && scene._mapNameWindow === window &&
            window._wqaBannerDrawnRevision === revision && window.parent && window.parent === scene._windowLayer &&
            window.worldVisible && window.worldAlpha > 0 && window.contentsOpacity > 0;
    }

    function observe(scene, revision, scripted = false) {
        const window = scene._mapNameWindow;
        const renderer = host.graphics.app?.renderer;
        if (!window || typeof renderer?.once !== 'function') return;
        if (scene._wqaEntranceFallback && !scripted) {
            window._wqaBannerRead = revision;
            return;
        }
        if (current?.scene === scene && !(scripted && current.fallback)) return;
        if (current) leave(current.scene);
        const context = { scene, window, revision, epoch: 0 };
        current = context;
        scene._wqaMapAnnouncement = revision;
        scene._wqaPresentation = true;
        try {
            renderer.once('postrender', () => {
                if (current !== context) return;
                try {
                    if (!ready(context)) return leave(scene);
                    const name = window._wqaBannerText;
                    window._wqaBannerRead = revision;
                    if (typeof name === 'string' && name.length > 0 && name.length <= 256) {
                        markPlace();
                        scene._wqaEntryNamed = true;
                        context.epoch = notifications.open({ kind: 'mapBanner', name, entering: true }, () => ready(context));
                    }
                    if (!context.epoch) leave(scene);
                } catch { leave(scene); }
            });
        } catch { leave(scene); }
    }

    if (host.window) {
        for (const event of ['blur', 'pagehide']) {
            host.window.addEventListener(event, () => { if (current) leave(current.scene); });
        }
    }
    return { observe, entrance, leave,
        append(scene, record) {
            if (current?.scene !== scene || !current.epoch ||
                !(current.fallback ? fieldReady(scene, true) : ready(current))) return false;
            return notifications.focus(current.epoch, { ...record, append: true });
        }
    };
}

module.exports = { createMapBannerObserver, mapPlace, numberedHouseName };
