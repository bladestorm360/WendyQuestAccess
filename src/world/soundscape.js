'use strict';

const { timedCave } = require('./puzzles/cave');

const { MAX_EVENTS } = require('./geometry.cjs');
const { eventTarget } = require('./snapshot');
const { travelMode } = require('./vehicle-navigation');
const { categoryCue } = require('./soundscape-presentation');

const CUE_NAMES = { person: 'entityPerson', exit: 'entityExit', door: 'entityDoor', stairs: 'entityStairs',
    treasure: 'entityTreasure', object: 'entityObject', checkpoint: 'entityCheckpoint' };
const MAX_RANGE = 6;
// Keep the start and repeat intervals when longer source clips overlap.
const MIN_GAP = 8;
const REPEAT_GAP = 26;
const EXIT_CLUSTER_RADIUS = 2;
// Covers the 405 ms door sample at the slowest stereo pitch, plus tail.
const SAMPLE_FRAMES = 36;
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

    function retireSample(current, sample) {
        audio.retire(current.scene, 'soundscape', undefined, sample?.voice);
        if (sample) current.samples[sample.voice] = null;
        else {
            current.samples.fill(null);
            current.preparing = false;
        }
        current.scene._wqaSoundscapeSample = current.preparing || current.samples.some(Boolean);
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
        const { event, entry, page, sprite, index, dx, dy, until, kind, category } = sample;
        if (owner !== current || current.samples[sample.voice] !== sample || !ready(scene) || frame() >= until ||
            map !== root.$gameMap || current.data !== root.$dataMap || player !== root.$gamePlayer ||
            map._events?.[event._eventId] !== event || event._erased || entry.pages[event._pageIndex] !== page ||
            event._trigger !== page.trigger || !preferences().soundscape.categories[category].enabled ||
            scene._spriteset?._characterSprites?.[index] !== sprite) return false;
        const [nowX, nowY] = offset(map, player, event);
        return Math.hypot(nowX, nowY) <= range(root, map) && Math.hypot(nowX - dx, nowY - dy) <= MAX_DRIFT &&
            categoryCue(root, map, scene._spriteset?._tilemap, event, entry, page, sample.target, sprite) === kind;
    }

    function select(current, options) {
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
        const choices = [];
        const nearbyExits = new Map();
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
            const choice = { event, entry, page, sprite, index, dx, dy, kind, category, target, distance,
                volume: settings.volume, ids: [id], last: heard.get(id) ?? -Infinity };
            if (category === 'exit' && target?.name && !/^exit$/i.test(target.name)) {
                const key = kind + ':' + target.name;
                const groups = nearbyExits.get(key) || [];
                // Keep each entrance at a real usable tile. Coalesce only
                // nearby approaches to the same named destination.
                const group = groups.find(candidate => Math.abs(dx - candidate.dx) + Math.abs(dy - candidate.dy) <=
                    EXIT_CLUSTER_RADIUS);
                if (group) {
                    group.ids.push(id);
                    group.last = Math.max(group.last, choice.last);
                    if (distance < group.choice.distance) group.choice = choice;
                } else {
                    const cluster = { choice, dx, dy, ids: choice.ids, last: choice.last };
                    groups.push(cluster);
                    nearbyExits.set(key, groups);
                }
            } else choices.push(choice);
        }
        for (const groups of nearbyExits.values()) for (const group of groups)
            choices.push({ ...group.choice, ids: group.ids, last: group.last });
        return choices.reduce((best, choice) => !best || choice.last < best.last ||
            (choice.last === best.last && choice.distance < best.distance) ? choice : best, null);
    }

    function present(current) {
        const { scene, player } = current;
        if (owner !== current) return;
        current.afterPaint = null;
        if (!ready(scene) || current.map !== root.$gameMap || current.data !== root.$dataMap ||
            player !== root.$gamePlayer) return leave(scene);
        const { hrtf, soundscape } = preferences();
        const sample = select(current, soundscape);
        if (!sample) return;
        const time = frame();
        if (time < sample.last + REPEAT_GAP) {
            scene._wqaSoundscapeDue = sample.last + REPEAT_GAP;
            return;
        }
        if (!audio.isPrepared(hrtf)) {
            const preparing = audio.prepare(scene, hrtf, () => owner === current && ready(scene), status => {
                current.preparing = false;
                scene._wqaSoundscapeSample = current.samples.some(Boolean);
                if (status < 0) current.unavailable = true;
            }, 'soundscape');
            if (preparing && !current.unavailable) current.preparing = scene._wqaSoundscapeSample = true;
            return;
        }
        const voice = current.samples.indexOf(null);
        if (voice < 0) return;
        sample.until = time + SAMPLE_FRAMES;
        sample.voice = voice;
        current.samples[voice] = sample;
        const { dx, dy } = sample;
        const bearing = sample.distance === 0 ? [0, 0, 1] : [dx, 0, -dy];
        const gain = (soundscape.volume / 100) * (sample.volume / 100) / (1 + 0.22 * sample.distance);
        if (!audio.play(scene, hrtf, audio.cues[CUE_NAMES[sample.kind]], gain, bearing,
            () => stillEligible(current, sample), null, 'soundscape', 1, 0, voice)) return retireSample(current, sample);
        for (const id of sample.ids) current.heard.set(id, time);
        scene._wqaSoundscapeSample = true;
        scene._wqaSoundscapeDue = time + MIN_GAP;
    }

    function update(scene) {
        if (!ready(scene)) return leave(scene);
        const renderer = root.Graphics.app?.renderer;
        if (typeof renderer?.once !== 'function') return leave(scene);
        if (owner?.scene !== scene || owner.map !== root.$gameMap || owner.data !== root.$dataMap ||
            owner.player !== root.$gamePlayer) {
            leave();
            owner = { scene, renderer, map: root.$gameMap, data: root.$dataMap, player: root.$gamePlayer,
                heard: new Map(), samples: Array(audio.soundscapeVoices - (timedCave(root.$gameMap._mapId) ? 2 : 0)).fill(null), preparing: false };
            scene._wqaSoundscapeActive = scene._wqaPresentation = true;
        }
        const current = owner;
        for (const sample of current.samples)
            if (sample && !stillEligible(current, sample)) retireSample(current, sample);
        if (frame() < scene._wqaSoundscapeDue) return;
        scene._wqaSoundscapeDue = frame() + REPEAT_GAP;
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
