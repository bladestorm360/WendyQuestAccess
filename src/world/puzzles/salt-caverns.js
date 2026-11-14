'use strict';

const { saltState, saltControlName } = require('./salt-state.cjs');

const MAP = 19;
const CRYSTALS = [19, 20, 21, 22];
const CLUES = [114, 115];
const ORDER = 'yellow, blue, green, then red';

function createSaltGuide(root) {
    const visits = new WeakMap();

    function available(scene) {
        return scene?._wqaMapRestored && !scene._wqaBattleStarted && root.$gameMap?._mapId === MAP;
    }

    function visitFor(scene) {
        if (!available(scene)) return null;
        let visit = visits.get(scene);
        if (visit?.data !== root.$dataMap) {
            visit = { data: root.$dataMap, active: false, reset: '' };
            visits.set(scene, visit);
        }
        return visit;
    }

    function presented(scene, paint) {
        if (!available(scene) || scene._wqaTerrainWork || paint.end !== paint.text.length) return;
        const source = root.$gameMessage?.interpreter;
        if (source?._mapId !== MAP || source._waitMode !== 'message') return;
        const id = source._eventId;
        if (id === 97 && source._index === 51 && source._list === root.$dataMap.events[id].pages[0].list) {
            const visit = visitFor(scene);
            visit.reset = root.$gameMap._interpreter === source ? 'The crystals were reset. ' : 'The crystal attempt reset. ';
        } else if (CRYSTALS.includes(id)) {
            visitFor(scene).reset = '';
        }
    }

    function review(scene, objects) {
        const visit = visitFor(scene);
        const state = saltState(root);
        if (!visit || !state) return null;
        visit.active = true;
        const select = id => objects.find(item => item.id === id && item.category !== 'quests');
        const exit = select(2);
        const prefix = visit.reset + 'Salt Caverns. ';
        if (state.finalOpen || state.order === 4)
            return { target: exit, text: prefix + 'The color sequence is complete. Follow directions to the north exit.' };
        if (!state.eastOpen && !(state.mask & 128) && root.$gamePlayer?._y >= 29)
            return { target: exit, text: prefix + 'Open the way to the four colored crystals first. The final order is ' + ORDER + '.' };
        const step = state.order;
        if (state.hits & (1 << step)) {
            return { target: select(97), text: prefix +
                'This attempt needs a reset. Use Crystal reset, then hit the colors in order: ' + ORDER + '.' };
        }
        const name = saltControlName(CRYSTALS[step]);
        return { target: select(CRYSTALS[step]), text: prefix + step + ' of 4 colors complete. Next, hit the ' +
            name.toLowerCase() + '. Full order: ' + ORDER + '.' };
    }

    return {
        available, presented, review,
        active(scene) { return visits.get(scene)?.active === true; },
        stop(scene) {
            const visit = visits.get(scene);
            if (!visit?.active) return false;
            visit.active = false;
            return true;
        },
        label(_scene, id, fallback) {
            if (CLUES.includes(id)) return 'Wall clue';
            return saltControlName(id) || fallback;
        }
    };
}

module.exports = { createSaltGuide };
