'use strict';
const { timedCave } = require('./puzzles/cave');

// This ticket is temporary navigation state, not a saved bookmark or a new
// destination. Only the existing native transfer reservation may carry it.
function createLocalDetour(root, transfers) {
    let journey = null;
    const copy = ({ event, map, x, y, approach }) => ({ event, map, x, y, approach });
    function clear() { journey = null; }
    return {
        clear,
        prepare(job, snapshot, target) {
            if (job.action !== 'directions' || snapshot.mode !== 'walk' || timedCave(snapshot.map) || job.area || !Number.isInteger(target.x) || !Number.isInteger(target.y)) return;
            // All local targets may need a verified leave-and-return route.
            const { entrances, state } = transfers.candidates();
            const trail = journey?.ticket.trail || [];
            // submit transfers the live terrain buffer to the worker. Retain
            // our own bounded copy for later native-map handoffs.
            const world = { ...snapshot.live, terrain: snapshot.live.terrain.slice() };
            job.detourApproach = { entrances, state, target, trail, world };
            return { map: snapshot.map, state, trail, candidates: entrances.map(copy), verifiedOnly: true,
                world, worldMap: snapshot.map, worldEntries: entrances.map(copy) };
        },
        accept(job, result) {
            const points = result.detourPoints;
            const approach = job.detourApproach;
            if (!approach || !Array.isArray(points) || !points.length || points.length > 32 ||
                points.some(p => !Number.isInteger(p?.x) || !Number.isInteger(p?.y) || p.x < 0 || p.y < 0 ||
                    p.x >= root.$dataMap.width || p.y >= root.$dataMap.height)) return false;
            const { entrances, state, target, trail, world } = approach;
            const bookmark = { worldMap: job.map, verifiedOnly: true, map: job.map, mode: 'walk', name: target.name, points, world, worldEntries: entrances.map(copy) };
            const selection = { detour: { ...bookmark, target }, trail };
            job.remote = { bookmark, entrances, ground: [], state, selection };
            return true;
        },
        settle(arrived) {
            if (!arrived?.detour) return false;
            journey = arrived.trail.length <= 32 ? { player: root.$gamePlayer, map: root.$gameMap._mapId, ticket: arrived } : null;
            return true;
        },
        resume(job, snapshot, remoteDirections, route) {
            if (!journey) return false;
            const { player, map, ticket } = journey;
            if (player !== root.$gamePlayer || map !== snapshot.map || snapshot.mode !== 'walk') { clear(); return false; }
            if (map !== ticket.detour.map) remoteDirections(job, snapshot, ticket.detour, ticket);
            else {
                const target = snapshot.objects.find(item => item.id === ticket.detour.target.id &&
                    item.category === ticket.detour.target.category);
                if (!target) { clear(); return false; }
                route(job, snapshot, target);
            }
            return true;
        }
    };
}
module.exports = { createLocalDetour };
