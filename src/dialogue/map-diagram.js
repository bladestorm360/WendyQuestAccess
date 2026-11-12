'use strict';

const { visibleSprite } = require('../battle/presentation');
const { reviewLines } = require('../menus/review');

const CAVERN = 'system/Caffeine Caverns Map';
const ATLAS = 'system/Savoria Map';
const PLAYER = 'system/WendyIcon';
const MARKERS = 'system/MapMarkers/Map Markers';
const QUEST = 'system/MapMarkers/Map Quest Marker';
const RUINS = { 166: 'southwest', 167: 'northwest', 168: 'northeast', 169: 'southeast', 170: 'center' };
const PATHWAYS = [
    'Pathway 1 loops through the northwest and branches toward the west and north center.',
    'Pathway 2 crosses the northeast, with branches near the east edge.',
    'Pathway 3 crosses the southern half. A small red symbol marks its southwest end.'
];
const SECTORS = [
    ['northwest', 'north', 'northeast'], ['west', 'center', 'east'], ['southwest', 'south', 'southeast']
];

function rectangle(sprite, graphics) {
    const pose = sprite.worldTransform;
    const frame = sprite._frame;
    if (!pose || pose.b !== 0 || pose.c !== 0 || !(pose.a > 0) || !(pose.d > 0) ||
        !(frame?.width > 0) || !(frame.height > 0)) return null;
    const width = frame.width * pose.a;
    const height = frame.height * pose.d;
    const x = pose.tx - width * sprite.anchor?.x;
    const y = pose.ty - height * sprite.anchor?.y;
    return x >= 0 && y >= 0 && x + width <= graphics.width && y + height <= graphics.height ?
        { x, y, width, height } : null;
}

function namedPicture(screen, container, sprites, id, name, graphics) {
    const picture = screen._pictures[id];
    const sprite = sprites.get(id);
    if (picture?._name !== name || sprite?._pictureName !== name || !visibleSprite(container, sprite) ||
        sprite.worldAlpha < 0.98 || sprite.texture?.valid !== true) return null;
    const bounds = rectangle(sprite, graphics);
    return bounds && { picture, sprite, bounds };
}

function sector(map, sprite) {
    const { tx, ty } = sprite.worldTransform;
    const column = Math.floor(3 * (tx - map.x) / map.width);
    const row = Math.floor(3 * (ty - map.y) / map.height);
    return SECTORS[row]?.[column] || '';
}

function pictureLabel(name, ruins) {
    if (name === MARKERS + '0') return ruins ? 'Open circle, ruin location' : 'Open circle marker';
    if (name === MARKERS + '1') return ruins ? 'Crossed-out ruin location' : 'Crossed-out marker';
    if (name === MARKERS + '2') return 'Large circle marker';
    if (name === MARKERS + '3') return 'Question-mark arrow';
    return name === QUEST ? 'Quest marker' : '';
}

function captureDiagram(root, graphics, scene, window) {
    const screen = root.$gameScreen;
    const source = root.$gameMessage?.interpreter;
    if (!scene._wqaMapRestored || !window.pause || source?._waitMode !== 'message' ||
        !screen?._pictures || !source._list || !Number.isInteger(source._index)) return null;
    const name = screen._pictures[27]?._name;
    if (name !== CAVERN && name !== ATLAS) return null;
    const spriteset = scene._spriteset;
    const container = spriteset?._pictureContainer_upper;
    if (spriteset?.parent !== scene || container?.parent !== spriteset ||
        !Array.isArray(container.children) || container.children.length > 128) return null;
    const sprites = new Map();
    for (const sprite of container.children) if (sprite?._pictureId >= 27 && sprite._pictureId <= 50)
        sprites.set(sprite._pictureId, sprite);
    const base = namedPicture(screen, container, sprites, 27, name, graphics);
    if (!base) return null;

    const slots = name === CAVERN ? [35, 36, 37, 38] : [38, 41, 42, 43, 44, 45, 50];
    // Native picture moves and reveals end before the diagram's stable page.
    // Let a pending alpha/position update settle before taking the snapshot.
    if (slots.some(id => screen._pictures[id]?._duration > 0)) return null;
    const ruins = name === ATLAS && Object.keys(RUINS).find(id => root.$dataCommonEvents?.[id]?.list === source._list);
    const lines = [name === CAVERN ?
        'North is up. Cliffs divide the cavern into northern passages and a broad southern area.' :
        'North is up. Snow northwest, desert northeast, greenery southwest, rivers southeast.'];
    const shown = [[27, name, base]];
    const player = namedPicture(screen, container, sprites, 38, PLAYER, graphics);
    const here = player && sector(base.bounds, player.sprite);
    if (here) {
        shown.push([38, PLAYER, player]);
        lines.push('Wendy marker, ' + here + ' of the map');
    }
    let paths = 0;
    if (name === CAVERN) {
        for (let index = 0; index < PATHWAYS.length; index++) {
            const id = 35 + index;
            const trail = CAVERN + ' Trail ' + (index + 1);
            const visible = namedPicture(screen, container, sprites, id, trail, graphics);
            if (!visible || visible.bounds.x !== base.bounds.x || visible.bounds.y !== base.bounds.y ||
                visible.bounds.width !== base.bounds.width || visible.bounds.height !== base.bounds.height) continue;
            shown.push([id, trail, visible]);
            lines.push(PATHWAYS[index]);
            paths++;
        }
    } else {
        for (const id of slots.slice(1)) {
            const marker = screen._pictures[id]?._name;
            const label = pictureLabel(marker, ruins);
            if (!label) continue;
            const visible = namedPicture(screen, container, sprites, id, marker, graphics);
            const area = visible && sector(base.bounds, visible.sprite);
            if (!area) continue;
            shown.push([id, marker, visible]);
            lines.push(label + ', ' + area + ' of the map');
        }
    }

    const list = source._list;
    const index = source._index;
    const title = name === CAVERN ? 'Caffeine Caverns map, ' + paths + (paths === 1 ? ' pathway shown' : ' pathways shown') :
        ruins ? 'World Atlas, ' + RUINS[ruins] + ' ruins map' : 'World Atlas';
    return {
        title, lines: reviewLines(lines), position: 0,
        live() {
            if (!window.pause || root.$gameMessage?.interpreter !== source || source._list !== list ||
                source._index !== index || source._waitMode !== 'message' || root.$gameScreen !== screen ||
                scene._spriteset !== spriteset || spriteset.parent !== scene ||
                spriteset._pictureContainer_upper !== container || container.parent !== spriteset) return false;
            return shown.every(([id, art, entry]) => {
                const { picture, sprite } = entry;
                return screen._pictures[id] === picture && picture._name === art &&
                    sprite._pictureName === art && visibleSprite(container, sprite) && sprite.worldAlpha >= 0.98;
            });
        }
    };
}

module.exports = { captureDiagram };
