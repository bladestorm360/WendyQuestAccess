'use strict';

const { DIRECTIONS, MAX_CELLS, MAX_EVENTS, tileKey } = require('./geometry.cjs');
const { validGate, gateAllows } = require('./transfer-gates.cjs');

const MAX_LANDINGS = 1024;
const MAX_LINKS = 16384;
const MAX_CATALOG_BYTES = 116 * 1024;

function validTile(map, x, y, maps) {
    const bounds = maps[map];
    return Number.isInteger(map) && map >= 1 && map <= 999 &&
        Number.isInteger(bounds?.width) && Number.isInteger(bounds?.height) &&
        bounds.width > 0 && bounds.height > 0 && bounds.width * bounds.height <= MAX_CELLS &&
        Number.isInteger(x) && x >= 0 && x < bounds.width &&
        Number.isInteger(y) && y >= 0 && y < bounds.height;
}

function readCatalog(data, maps) {
    if (data?.version !== 1 || !Array.isArray(data.landings) || data.landings.length > MAX_LANDINGS)
        throw Error('Unsupported walking catalog');
    const byTile = new Map();
    const incoming = data.landings.map(() => []);
    let linkCount = 0;
    const landings = data.landings.map(([map, x, y, encoded, exits, conditional], index) => {
        const key = tileKey(map, x, y);
        if (!validTile(map, x, y, maps) || byTile.has(key) || typeof encoded !== 'string' || encoded.length > 2732 ||
            !Array.isArray(exits) || exits.length % 2 || exits.length > MAX_EVENTS * 4)
            throw Error('Invalid walking landing');
        const points = Buffer.from(encoded, 'base64');
        if (points.length !== Math.ceil(maps[map].width * maps[map].height / 8)) throw Error('Invalid walking mask');
        let opened;
        if(conditional!==undefined) {
            if(!Array.isArray(conditional)||conditional.length!==2||!conditional[0]||!validGate(conditional[0])||
                typeof conditional[1]!=='string'||conditional[1].length>2732)throw Error('Invalid conditional landing');
            const extra=Buffer.from(conditional[1],'base64');
            if(extra.length!==points.length)throw Error('Invalid conditional landing mask');
            opened={gate:conditional[0],points:extra};
        }
        byTile.set(key, index);
        for (let i = 0; i < exits.length; i += 2) {
            const [next, gate] = [exits[i], exits[i + 1]];
            if (!Number.isInteger(next) || next < 0 || next >= incoming.length ||
                !validGate(gate) || ++linkCount > MAX_LINKS)
                throw Error('Invalid walking connection');
            incoming[next].push({ previous: index, gate });
        }
        return { map, key, points, opened };
    });
    return { landings, byTile, incoming };
}

function remainingTransfers(catalog, map, point, state, visited, maps, cancelled, points) {
    const target = point && validTile(map, point.x, point.y, maps) ? point.y * maps[map].width + point.x : -1;
    const targets = points?.map(p => validTile(map, p.x, p.y, maps) ? p.y * maps[map].width + p.x : -1);
    const { landings, incoming } = catalog;
    const ranks = new Uint16Array(landings.length);
    const queue = [];
    for (const [index, landing] of landings.entries()) {
        if (cancelled()) return ranks;
        const points=landing.opened&&gateAllows(landing.opened.gate,state)?landing.opened.points:landing.points;
        if (landing.map !== map || visited.has(landing.key) ||
            (targets && !targets.some(cell => cell >= 0 && (points[cell >> 3] & (1 << (cell & 7))))) ||
            (point && (target < 0 || !(points[target >> 3] & (1 << (target & 7)))))) continue;
        queue.push(index);
        ranks[index] = 1;
    }
    for (let cursor = 0; cursor < queue.length; cursor++) {
        if (cancelled()) return ranks;
        const node = queue[cursor];
        for (const { previous, gate } of incoming[node]) {
            if (ranks[previous] || visited.has(landings[previous].key) || !gateAllows(gate, state)) continue;
            ranks[previous] = ranks[node] + 1;
            queue.push(previous);
        }
    }
    return ranks;
}

function rankEntrances(catalog, source, transfer, maps, cancelled, allowDirectFallback = true) {
    const { map, point, points, candidates, state, trail = [] } = transfer || {};
    if (!Number.isInteger(map) || (map === source && !points) || !maps[map] || !Array.isArray(candidates) ||
        (points !== undefined && (!Array.isArray(points) || !points.length || points.length > 32 ||
            points.some(p => !p || !validTile(map, p.x, p.y, maps)))) ||
        candidates.length > MAX_EVENTS || !Array.isArray(trail) || trail.length > MAX_LANDINGS) return [];
    const visited = new Set(trail);
    const ranks = catalog && remainingTransfers(catalog, map, point, state, visited, maps, cancelled, points);
    const options = [];
    for (const candidate of candidates) {
        if (cancelled()) return [];
        // A request from an older direct-only renderer omits the edge map.
        const { event, x, y, map: target = map, approach } = candidate;
        if (!Number.isInteger(event) || event < 1 || event > MAX_EVENTS || target === source || !validTile(target, x, y, maps) ||
            (approach !== undefined && !DIRECTIONS.includes(approach)))
            continue;
        const key = tileKey(target, x, y);
        if (visited.has(key)) continue;
        const index = catalog?.byTile.get(key);
        const rank = ranks?.[index];
        if (rank || (!approach && allowDirectFallback && target === map && index === undefined))
            options.push(approach ? { event, rank, approach } : { event, rank: rank || MAX_LANDINGS + 1 });
    }
    return options;
}

module.exports = { MAX_CATALOG_BYTES, MAX_LANDINGS, MAX_LINKS, validTile, readCatalog, rankEntrances };
