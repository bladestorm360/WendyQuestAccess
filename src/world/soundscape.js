'use strict';

const { MAX_EVENTS } = require('./geometry.cjs');
const { CARDINAL } = require('./spatial-direction');
const { eventTarget } = require('./snapshot');
const { travelMode } = require('./vehicle-navigation');
const { categoryCue } = require('./soundscape-presentation');

const CUE_NAMES = { person: 'entityPerson', exit: 'entityExit', door: 'entityDoor', stairs: 'entityStairs',
    treasure: 'entityTreasure', object: 'entityObject', checkpoint: 'entityCheckpoint' };
const MAX_RANGE = 6;
const PULSE_GAP = 26;
const SAMPLE_FRAMES = 10;
const MAX_DRIFT = 0.5;
const MAX_COMMANDS = 1024;
const MAX_SPRITES = MAX_EVENTS + 8;

function range(root, map) {
    const light = root.$gameVariables;
    if (light?._Community_Lighting_ScriptActive === false) return MAX_RANGE;
    // The active lighting plug-in's current radius is in game pixels.
    // Leave a margin at the dim end of the radial falloff.
    const radius = light?._Community_Lighting_Radius ?? 150;
    return Math.min(MAX_RANGE, Math.max(0, (radius - 16) / map.tileWidth()));
}

function offset(map, player, event) {
    return [map.deltaX(event._realX, player._realX), map.deltaY(event._realY, player._realY)];
}

function createSoundscape(root, fieldReady, audio, preferences, navigationPreferences = () => ({})) {
    let owner = null;
    const frame = () => root.Graphics.frameCount;

    function ready(scene) {
        const { enabled, soundscape } = preferences();
        return enabled && soundscape?.enabled && soundscape.volume > 0 && fieldReady(scene, true) &&
            !root.$gameMap.isAnyEventStarting?.();
    }

    function retireSample(current) {
        audio.retire(current.scene, 'soundscape');
        current.sample = null;
        current.scene._wqaSoundscapeSample = false;
    }

    function leave(scene) {
        if (!owner || (scene && scene !== owner.scene)) return;
        const current = owner;
        owner = null;
        retireSample(current);
        if (current.afterPaint) current.renderer.off?.('postrender', current.afterPaint);
        current.scene._wqaSoundscapeDue = 0;
        current.scene._wqaSoundscapeActive = false;
    }

    function stillEligible(current, sample) {
        const { scene, map, player } = current;
        const { event, entry, page, sprite, index, dx, dy, facing, until, kind, category } = sample;
        if (owner !== current || current.sample !== sample || !ready(scene) || frame() >= until ||
            map !== root.$gameMap || current.data !== root.$dataMap || player !== root.$gamePlayer || player._direction !== facing ||
            map._events?.[event._eventId] !== event || event._erased || entry.pages[event._pageIndex] !== page ||
            event._trigger !== page.trigger || !preferences().soundscape.categories[category].enabled ||
            scene._spriteset?._characterSprites?.[index] !== sprite) return false;
        const [nowX, nowY] = offset(map, player, event);
        return Math.hypot(nowX, nowY) <= range(root, map) && Math.hypot(nowX - dx, nowY - dy) <= MAX_DRIFT &&
            categoryCue(root, map, scene._spriteset?._tilemap, event, entry, page, sample.target, sprite) === kind;
    }

    function select(current, options, facing) {
        const { scene, map, player, heard } = current;
        const data = root.$dataMap;
        const spriteset = scene._spriteset;
        const sprites = spriteset?._characterSprites;
        const mode = travelMode(map, player);
        const radius = range(root, map);
        if (!mode || !data || !Array.isArray(map._events) || map._events.length > MAX_EVENTS + 1 ||
            !Array.isArray(sprites) || sprites.length > MAX_SPRITES || !(radius > 0)) return null;

        const indices = new Map();
        for (let index = 0; index < sprites.length; index++) {
            const event = sprites[index]?._character;
            if (event && map._events[event._eventId] === event) indices.set(event, index);
        }
        const choices = Object.create(null);
        const spoilers = navigationPreferences().spoilers === true;
        for (const event of map._events) {
            if (!event || event._erased || event._pageIndex < 0 || event._trigger < 0 || event._trigger > 2) continue;
            const [dx, dy] = offset(map, player, event);
            const distance = Math.hypot(dx, dy);
            if (!(distance <= radius)) continue;
            const id = event._eventId;
            const entry = data.events?.[id];
            const page = entry?.pages[event._pageIndex];
            if (!page || page.trigger !== event._trigger || page.list.length < 2 || page.list.length > MAX_COMMANDS) continue;
            const target = eventTarget(root, mode, event, entry, page, spoilers);
            const index = indices.get(event);
            const sprite = sprites[index];
            const kind = categoryCue(root, map, spriteset._tilemap, event, entry, page, target, sprite);
            if (!kind) continue;
            const category = kind === 'door' || kind === 'stairs' ? 'exit' : kind;
            const settings = options.categories[category];
            if (!settings.enabled || settings.volume <= 0) continue;
            const last = heard.get(id) ?? -Infinity;
            const previous = choices[category];
            if (!previous || last < previous.last || (last === previous.last && distance < previous.distance))
                choices[category] = { event, entry, page, sprite, index, dx, dy, facing, kind, category,
                    target, last, distance, volume: settings.volume };
        }
        const categories = Object.keys(options.categories);
        for (let i = 0; i < categories.length; i++) {
            const index = (current.nextCategory + i) % categories.length;
            const choice = choices[categories[index]];
            if (choice) return { choice, nextCategory: (index + 1) % categories.length };
        }
        return null;
    }

    function present(current) {
        const { scene, player } = current;
        if (owner !== current) return;
        current.afterPaint = null;
        if (!ready(scene) || current.map !== root.$gameMap || current.data !== root.$dataMap ||
            player !== root.$gamePlayer) return leave(scene);
        const { hrtf, soundscape } = preferences();
        const facing = player._direction;
        const view = CARDINAL[facing];
        if (!view) return;
        const selection = select(current, soundscape, facing);
        if (!selection) return;
        if (!audio.isPrepared(hrtf)) {
            const preparing = audio.prepare(scene, hrtf, () => owner === current && ready(scene), status => {
                audio.retire(scene, 'soundscape');
                scene._wqaSoundscapeSample = false;
                if (status < 0) current.unavailable = true;
            }, 'soundscape');
            if (preparing && !current.unavailable) scene._wqaSoundscapeSample = true;
            return;
        }
        const sample = selection.choice;
        sample.until = frame() + SAMPLE_FRAMES;
        current.sample = sample;
        const { dx, dy } = sample;
        const bearing = sample.distance === 0 ? [0, 0, 1] :
            [view.x * dy - view.y * dx, 0, view.x * dx + view.y * dy];
        const gain = (soundscape.volume / 100) * (sample.volume / 100) / (1 + 0.22 * sample.distance);
        if (!audio.play(scene, hrtf, audio.cues[CUE_NAMES[sample.kind]], gain, bearing,
            () => stillEligible(current, sample), null, 'soundscape')) return retireSample(current);
        current.heard.set(sample.event._eventId, frame());
        current.nextCategory = selection.nextCategory;
        scene._wqaSoundscapeSample = true;
    }

    function update(scene) {
        if (!ready(scene)) return leave(scene);
        const renderer = root.Graphics.app?.renderer;
        if (typeof renderer?.once !== 'function') return leave(scene);
        if (owner?.scene !== scene || owner.map !== root.$gameMap || owner.data !== root.$dataMap ||
            owner.player !== root.$gamePlayer) {
            leave();
            owner = { scene, renderer, map: root.$gameMap, data: root.$dataMap, player: root.$gamePlayer,
                heard: new Map(), nextCategory: 0 };
            scene._wqaSoundscapeActive = scene._wqaPresentation = true;
        }
        const current = owner;
        if (current.sample && !stillEligible(current, current.sample)) retireSample(current);
        if (frame() < scene._wqaSoundscapeDue) return;
        scene._wqaSoundscapeDue = frame() + PULSE_GAP;
        if (current.afterPaint || current.unavailable) return;
        current.afterPaint = () => {
            try { present(current); } catch { leave(scene); }
        };
        renderer.once('postrender', current.afterPaint);
    }

    return {
        update, leave,
        invalidate(scene) { if (owner?.scene === scene) retireSample(owner); }
    };
}

module.exports = { createSoundscape };
