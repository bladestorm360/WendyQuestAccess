'use strict';

const MAP = 19;
const CRYSTALS = [19, 20, 21, 22];
const CLUES = [114, 115];
const FLOOD_CONTROLS = [36, 49, 68, 120];
const RESET = 97;
const OUTCOMES = {
    reset: 'The crystals were reset.',
    attemptReset: 'The crystal attempt reset.',
    orderComplete: 'The ordered crystals opened a passage.',
    passage: 'A crystal changed the passage to the exit.'
};

function createSaltGuide(root) {
    // A paused event keeps its map scene. A replaced scene can release its
    // renderer and authored data without a puzzle-specific native hook.
    const visits = new WeakMap();

    function available(scene) {
        return scene?._wqaMapRestored && !scene._wqaBattleStarted && root.$gameMap?._mapId === MAP;
    }

    function current(scene) {
        if (!available(scene)) return null;
        const data = root.$dataMap;
        if (!data) return null;
        let visit = visits.get(scene);
        if (visit?.data !== data) {
            visit = { data, active: false, order: [], colors: new Map(), lit: new Set(), outcome: '' };
            visits.set(scene, visit);
        }
        return visit;
    }

    function presented(scene, paint) {
        if (!available(scene) || scene._wqaTerrainWork || paint.end !== paint.text.length || paint.end > 384) return;
        // EliMZ_Book identifies the interpreter that actually owns this message,
        // including a nested reset. Match its native page and wait position.
        const source = root.$gameMessage?.interpreter;
        if (!source?._list || source._mapId !== MAP || source._waitMode !== 'message') return;
        const id = source._eventId;
        const page = root.$dataMap?.events?.[id]?.pages?.[id === 35 ? 1 : 0];
        if (page?.list !== source._list) return;
        const index = source._index;
        const clue = CLUES.includes(id) && index === 8;
        const crystal = CRYSTALS.includes(id) && index === 25;
        const reset = id === RESET && index === 51;
        const orderComplete = id === 35 && index === 21;
        const passage = (id === 36 && index === 54) || (id === 49 && index === 96) || (id === 68 && index === 84);
        if (!(clue || crystal || reset || orderComplete || passage)) return;

        const state = current(scene);
        if (!state) return;
        if (clue || crystal) {
            const colors = paint.text.toLowerCase().match(/\b(?:yellow|blue|green|red)\b/g) || [];
            if (clue && colors.length === 4 && new Set(colors).size === 4) state.order = colors;
            if (crystal && colors.length === 1) {
                state.colors.set(id, colors[0]);
                state.lit.add(id);
                state.outcome = '';
            }
        } else if (reset) {
            state.lit.clear();
            state.outcome = root.$gameMap._interpreter === source ? 'reset' : 'attemptReset';
        } else state.outcome = orderComplete ? 'orderComplete' : 'passage';
    }

    function review(scene, objects, x, y) {
        const state = current(scene);
        if (!state) return null;
        state.active = true;
        let text = 'Salt Caverns crystals. ';
        if (state.outcome) text += OUTCOMES[state.outcome] + ' ';
        if (state.outcome === 'orderComplete' || state.outcome === 'passage') {
            return { target: null, text: text + 'Use Exits and directions to check the way forward.' };
        }
        const clue = state.order.length === 0;
        let target = null;
        if (clue) {
            let nearest = Infinity;
            for (const item of objects) {
                if (!CLUES.includes(item.id)) continue;
                const distance = Math.abs(x - item.x) + Math.abs(y - item.y);
                if (distance < nearest) {
                    nearest = distance;
                    target = item;
                }
            }
        }
        if (clue) {
            text += target ? 'Wall clue selected. Get directions and use the action button to read it.' :
                'Read a wall clue for the crystal order.';
        } else {
            text += 'Wall clue order: ' + state.order.join(', ') + '. ';
            const lit = Array.from(state.lit, id => state.colors.get(id));
            if (lit.length) text += 'Lights observed this visit: ' + lit.join(', ') + '. ';
            text += 'Use Objects to find crystals and the reset.';
        }
        return { target, text };
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
        label(scene, id, fallback) {
            if (CLUES.includes(id)) return 'Wall clue';
            if (id === RESET) return 'Crystal reset';
            if (FLOOD_CONTROLS.includes(id)) return 'Terrain crystal';
            const visit = visits.get(scene);
            const color = visit?.data === root.$dataMap && visit?.colors.get(id);
            return color ? color[0].toUpperCase() + color.slice(1) + ' crystal' : fallback;
        }
    };
}

module.exports = { createSaltGuide };
