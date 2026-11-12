'use strict';

const { checkpointTarget } = require('./puzzles/cave');

// These are native marker destinations, keyed by the entrance's stable event ID.
// Each value pairs the painted layer with the verified marker tile.
const WORLD_MARKERS = {
    13: [3, 76], 76: [2, 76], 80: [2, 77], 83: [2, 78], 84: [3, 79],
    88: [2, 77], 89: [2, 79], 93: [2, 79], 96: [2, 78], 100: [3, 76],
    102: [3, 79], 105: [3, 76], 108: [3, 78], 110: [3, 76], 114: [3, 77],
    116: [3, 78], 121: [2, 78], 122: [3, 76], 126: [3, 77], 129: [2, 79],
    132: [3, 86], 135: [2, 87], 155: [3, 76], 156: [3, 76]
};

const TRANSFER_GRAPHICS = {
    8: { 242: 'exit' },
    10: { 556: 'exit', 763: 'door', 863: 'door', 889: 'exit' },
    12: { 556: 'exit', 763: 'door', 863: 'door', 889: 'exit' },
    17: { 398: 'stairs', 502: 'stairs', 1010: 'exit' }
};

function onScreen(graphics, x, y) {
    return x >= 0 && y >= 0 && x < graphics.width && y < graphics.height;
}

function spriteVisible(sprite, actor, graphics) {
    const image = sprite?._frame;
    const transform = sprite?.worldTransform;
    if (sprite?._character !== actor || !sprite?.worldVisible || !(sprite.worldAlpha > 0) ||
        !sprite.renderable || sprite.texture?.valid !== true || actor._transparent || !(actor._opacity > 0) ||
        sprite._tileId !== actor._tileId || sprite._characterName !== actor._characterName ||
        !(image?.width > 0) || !(image.height > 0) || !transform ||
        !(actor._tileId > 0 || actor._characterName)) return false;
    return onScreen(graphics, transform.tx, transform.ty - image.height * transform.d / 2);
}

function tileVisible(root, map, tilemap, x, y) {
    const transform = tilemap?.worldTransform;
    if (!transform || !tilemap.worldVisible || !(tilemap.worldAlpha > 0) || !tilemap.renderable) return false;
    const dx = (map.adjustX(x) + 0.5) * map.tileWidth();
    const dy = (map.adjustY(y) + 0.5) * map.tileHeight();
    return onScreen(root.Graphics, transform.a * dx + transform.c * dy + transform.tx,
        transform.b * dx + transform.d * dy + transform.ty);
}

function categoryCue(root, map, tilemap, event, entry, page, target, sprite) {
    const id = event._eventId;
    const { _x: x, _y: y } = event;
    const graphic = spriteVisible(sprite, event, root.Graphics);
    const checkpoint = checkpointTarget(map._mapId, id, event._pageIndex, event._trigger);
    if (checkpoint || target?.category === 'exits') {
        const marker = map._mapId === 113 && WORLD_MARKERS[id];
        // The authored entrance can have a usable page before discovery.
        // Only its published map marker permits the ambient cue.
        if (marker && (x !== entry.x || y !== entry.y || map.tileId(x, y, marker[0]) !== marker[1])) return null;
        if (!tileVisible(root, map, tilemap, x, y)) return graphic && !checkpoint ? 'exit' : null;
        if (checkpoint) return map._tilesetId === 8 && map.tileId(x, y, 2) === 680 &&
            map.tileId(x, y, 3) === 529 ? 'checkpoint' : null;
        if (map._mapId === 113) return marker || graphic ? 'exit' : null;
        const appearances = TRANSFER_GRAPHICS[map._tilesetId];
        const art = appearances?.[map.tileId(x, y, 3)] || appearances?.[map.tileId(x, y, 2)];
        if (art) return art;
        if (graphic) return 'exit';
        // A live floor transfer at an exposed map edge is a generic exit.
        // Interior invisible floor events remain navigation targets only.
        const { width, height, scrollType } = root.$dataMap;
        const edge = (scrollType & 2) === 0 && (x === 0 || x === width - 1) ||
            (scrollType & 1) === 0 && (y === 0 || y === height - 1);
        if (edge && event._trigger === 1 && page.list.some(command => command.code === 201 && command.indent === 0))
            return 'exit';
        return null;
    }
    if (!graphic) return null;
    if (target?.category === 'people' || target?.category === 'merchants') return 'person';
    if (target?.category === 'treasure' && page.list.some(command =>
        command.code === 117 || (command.code >= 125 && command.code <= 128) || command.code === 355 || command.code === 357))
        return 'treasure';
    if (target?.category === 'objects') return 'object';
    return null;
}

module.exports = { categoryCue };
