'use strict';

const { tileKey } = require('./geometry.cjs');

const CAVE = 204;
const PEAK = 27;
const CRYSTAL_CAVE = 37;
const STONE_ISLAND = 86;
const BRIDGES = 97;
const CRYSTAL = 145;
const BRIDGE_REASON = 'The bridges open after the encounter on Breakfast Stone Island.';
const PULL_REASON = 'The pull handle is on the other side. Go around through the main Cauldron entrance.';
const CRYSTAL_REASON = 'This passage opens after you activate the crystal in Frosty Peak cave.';

// Keep one explicit directions selection across the required native maps.
// This stores only the player identity and destination, and never executes
// an event or assumes that a switch changed merely because a route was read.
function createTerrainJourney(root) {
    let trip = null;

    return {
        clear() { trip = null; },
        begin(gate, origin, target, nextMap, originPoint, landing) {
            if (!target || ![BRIDGES, CRYSTAL, 'pull'].includes(gate) || !Number.isInteger(nextMap)) return;
            trip = { gate, player: root.$gamePlayer, origin, originPoint, target: { id: target.id, category: target.category },
                lastMap: origin, nextMap, landing, trail: new Set(), open: false };
        },
        advance(map, nextMap, landing) {
            if (!trip || !Number.isInteger(nextMap)) return;
            trip.lastMap = map;
            trip.nextMap = nextMap;
            trip.landing = landing;
            if (trip.gate === 'pull' && map === 28 && nextMap === 55) trip.returning = true;
        },
        next(snapshot) {
            if (!trip) return null;
            const { gate, player, origin, target, nextMap } = trip;
            const { map, mode, objects } = snapshot;
            if (player !== root.$gamePlayer || mode !== 'walk' ||
                ![origin, trip.lastMap, nextMap].includes(map)) {
                trip = null;
                return null;
            }
            const stage = gate === 'pull' ? root.$gameVariables?.value?.(4) : undefined;
            const open = gate === 'pull' ? stage >= 3 : root.$gameSwitches?.value?.(gate);
            if (typeof open !== 'boolean') return null;
            if (map === origin && open) {
                trip = null;
                return { target: objects.find(item => item.id === target.id && item.category === target.category), restore: true };
            }
            if (gate === 'pull') {
                const step = map === 55 ? trip.returning ? [4] : [2, 57] :
                    map === 57 ? [13, stage === 2 ? 28 : 44] :
                    map === 28 ? [7, 55] : map === 44 ? [8, 55] : [];
                const target = objects.find(item => item.id === step[0] && item.category !== 'quests');
                return { text: map === 55 && trip.returning ? 'Use the pull handle to open the passage.' : PULL_REASON,
                    target: target && (step[1] ? target : { ...target, eventAction: 'interact' }), map: step[1] };
            }
            if (gate === CRYSTAL) {
                const step = map === CAVE ? [3, PEAK] : map === PEAK ? open ? [44, CAVE] : [17, CRYSTAL_CAVE] :
                    map === CRYSTAL_CAVE ? open ? [3, PEAK] : [4] : null;
                if (!step) return null;
                const next = objects.find(item => item.id === step[0] && item.category !== 'quests');
                const text = open ? 'Return to the Cold Brew Trail cave.' : CRYSTAL_REASON;
                return { text, target: next && (step[1] ? next : { ...next, eventAction: 'interact' }), map: step[1] };
            }
            if (trip.open !== open) {
                trip.open = open;
                trip.trail.clear();
            }
            if (map === nextMap && map !== trip.lastMap && trip.landing) {
                trip.trail.add(tileKey(map, trip.landing.x, trip.landing.y));
                trip.landing = null;
                if (trip.trail.size > 32) trip.trail.delete(trip.trail.values().next().value);
            }
            if (map === STONE_ISLAND && !open)
                return { text: BRIDGE_REASON, target: objects.find(item => item.id === 17 && item.eventAction === 'step') };
            return { text: open ? 'The bridges are open.' : BRIDGE_REASON, transfer: open ? origin : STONE_ISLAND,
                breakfast: open, point: open ? trip.originPoint : undefined, trail: [...trip.trail] };
        }
    };
}

module.exports = { createTerrainJourney, BRIDGE_REASON, CRYSTAL_REASON, PULL_REASON, STONE_ISLAND };
