'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { performance } = require('node:perf_hooks');
const { CUE } = require('../src/runtime/audio');
const { createSoundscape } = require('../src/world/soundscape');
const { categoryCue } = require('../src/world/soundscape-presentation');
const { normalizeSoundscape } = require('../src/settings/soundscape-preferences');

function verifySoundscape(root, load) {
    const sprites = new EventEmitter();
    const played = [];
    let request = null;
    let allowed = true;
    let options = { enabled: true, hrtf: false, soundscape: normalizeSoundscape() };
    const audio = {
        cues: CUE, isPrepared: () => true,
        play(scene, hrtf, cue, gain, bearing, ready, complete, source) {
            assert.equal(source, 'soundscape');
            assert(ready(), 'the initial copied observation still qualifies for audio');
            request = { scene, hrtf, cue, gain, bearing, ready };
            played.push(request);
            return true;
        },
        retire(scene, source) {
            assert.equal(source, 'soundscape');
            if (request?.scene === scene) request = null;
        }
    };
    const soundscape = createSoundscape(root, () => allowed, audio, () => options);
    const tilemap = { worldVisible: true, worldAlpha: 1, renderable: true,
        worldTransform: { a: 1, d: 1, b: 0, c: 0, tx: 0, ty: 0 } };
    root.Graphics.app = { renderer: sprites };
    root.Graphics.frameCount = 1;

    function setup(map, ids, playerX, playerY, shown = ids, states) {
        soundscape.leave();
        played.length = 0;
        const fixture = load(map, states);
        const { gameMap, player } = fixture;
        const actors = gameMap._events;
        gameMap._events = [];
        for (const id of ids) {
            const event = gameMap._events[id] = actors[id];
            const image = event.page().image;
            Object.assign(event, { _characterName: image.characterName, _tileId: image.tileId,
                _realX: event._x, _realY: event._y, _opacity: 255 });
        }
        Object.assign(player, { _x: playerX, _y: playerY, _realX: playerX, _realY: playerY, _direction: 8 });
        gameMap._displayX = playerX - 5;
        gameMap._displayY = playerY - 4;
        const characterSprites = shown.map(id => {
            const event = actors[id];
            return { _character: event, _tileId: event._tileId, _characterName: event._characterName,
                worldVisible: true, worldAlpha: 1, renderable: true, texture: { valid: true },
                _frame: { width: 32, height: 32 }, worldTransform: { tx: 164, ty: 156, d: 1 } };
        });
        const scene = { _wqaFieldReady: true, _spriteset: { _characterSprites: characterSprites, _tilemap: tilemap } };
        root.SceneManager._scene = scene;
        return { ...fixture, scene, actors, characterSprites };
    }

    function sample(scene) {
        root.Graphics.frameCount = Math.max(root.Graphics.frameCount + 1, scene._wqaSoundscapeDue || 1);
        soundscape.update(scene);
        sprites.emit('postrender');
        return request;
    }

    root.$gameVariables._Community_Lighting_ScriptActive = false;
    let f = setup(19, [3], 23, 18);
    assert.equal(sample(f.scene), null, 'soundscape defaults off');
    options.soundscape.enabled = true;
    let cue = sample(f.scene);
    assert.equal(cue.cue, CUE.entityTreasure);
    assert.deepEqual(cue.bearing, [1, 0, 2]);
    assert(cue.gain < 0.45 && cue.gain > 0);
    f.actors[3]._pageIndex = 1;
    assert.equal(cue.ready(), false);
    assert.equal(sample(f.scene), null, 'a collected chest retires the cue');
    f.actors[3]._pageIndex = 0;
    f.characterSprites[0].worldAlpha = 0;
    assert.equal(sample(f.scene), null, 'a fully transparent sprite does not reveal treasure');
    f.characterSprites[0].worldAlpha = 1;
    f.characterSprites[0].texture.valid = false;
    assert.equal(sample(f.scene), null, 'an unavailable sprite bitmap does not reveal treasure');
    f.characterSprites[0].texture.valid = true;
    f.characterSprites[0].worldTransform.tx = -200;
    assert.equal(sample(f.scene), null, 'off-screen sprites do not emit');
    f.characterSprites[0].worldTransform.tx = 164;
    root.$gameVariables._Community_Lighting_ScriptActive = true;
    root.$gameVariables._Community_Lighting_Radius = 64;
    assert.equal(sample(f.scene), null, 'the current player light bounds the listening range');
    root.$gameVariables._Community_Lighting_ScriptActive = false;
    assert.equal(sample(f.scene).cue, CUE.entityTreasure);
    options.soundscape.categories.treasure.enabled = false;
    assert.equal(sample(f.scene), null, 'category disable retires current audio');
    options.soundscape.categories.treasure.enabled = true;

    f = setup(128, [7, 8], 3, 6, [7, 8], { switches: [38] });
    cue = sample(f.scene);
    assert.equal(cue.cue, CUE.entityPerson);
    assert.deepEqual(cue.bearing, [-1, 0, -1]);
    f.actors[7]._realX = 2.75;
    assert.equal(cue.ready(), false, 'a moved source revokes the old pose');
    assert.equal(sample(f.scene).cue, CUE.entityTreasure, 'eligible categories take turns');
    f.player._direction = 2;
    assert.equal(sample(f.scene), null, 'preserve the ordinary interval before a source repeats');
    cue = sample(f.scene);
    assert.equal(cue.cue, CUE.entityPerson);
    assert.deepEqual(cue.bearing, [-0.25, 0, -1], 'turning keeps absolute bearing while the cue follows interpolation');

    f = setup(25, [7, 15, 16], 47, 27, []);
    const beforeExit = root.Graphics.frameCount;
    cue = sample(f.scene);
    assert.equal(cue.cue, CUE.entityExit);
    assert.deepEqual(cue.bearing, [2, 0, -0], 'use the actual nearest tile of the east exit');
    f.player._direction = 4;
    assert(cue.ready(), 'turning in place keeps the admitted exit voice');
    assert.equal(sample(f.scene), null, 'grouped exit tiles do not emit another copy');
    cue = sample(f.scene);
    assert.deepEqual(cue.bearing, [2, 0, -0]);
    assert(root.Graphics.frameCount >= beforeExit + 26);
    assert.equal(played.length, 2, 'only one voice per nearby exit group per repeat');

    f = setup(127, [2], 3, 3, []);
    const stairs = f.actors[2];
    f.player._x = f.player._realX = stairs._x;
    f.player._y = f.player._realY = stairs._y + 1;
    f.gameMap._displayX = stairs._x - 3;
    f.gameMap._displayY = stairs._y - 3;
    assert.equal(sample(f.scene).cue, CUE.entityStairs);
    root.$gameSwitches.value = id => id === 503;
    soundscape.invalidate(f.scene);
    assert.equal(request, null);
    const renewedStair = sample(f.scene) || sample(f.scene);
    assert.equal(renewedStair?.cue, CUE.entityStairs, 'the native unlock retains the visible stair identity');

    f = setup(44, [7], 17, 10, []);
    assert.equal(sample(f.scene).cue, CUE.entityDoor);
    f = setup(14, [2], 1, 21, []);
    assert.equal(sample(f.scene).cue, CUE.entityExit, 'an ordinary live edge transfer gives the generic exit tone');
    f = setup(196, [21], 16, 7, []);
    assert.equal(sample(f.scene).cue, CUE.entityCheckpoint);
    root.WendyQuestAccessFieldEvent = scene => soundscape.leave(scene);
    f.actors[21].start();
    assert.equal(f.actors[21].isStarting(), true);
    assert.equal(request, null, 'the native event-start marker revoked the checkpoint cue');
    assert.equal(f.scene._wqaSoundscapeActive, false);
    delete root.WendyQuestAccessFieldEvent;

    f = setup(113, [13], 47, 6, []);
    assert.equal(sample(f.scene), null, 'the unpainted secret entrance stays quiet');
    const entrance = f.actors[13];
    f.map.data[3 * f.map.width * f.map.height + entrance._y * f.map.width + entrance._x] = 76;
    assert.equal(sample(f.scene).cue, CUE.entityExit, 'the painted entrance can now emit');
    root.Graphics.frameCount = f.scene._wqaSoundscapeDue;
    soundscape.update(f.scene);
    assert.equal(sprites.listenerCount('postrender'), 1);
    allowed = false;
    soundscape.leave(f.scene);
    assert.equal(sprites.listenerCount('postrender'), 0);
    sprites.emit('postrender');
    assert.equal(request, null);
    allowed = true;

    // Compare the presentation adapter to every installed marker edit. The
    // native destination is already independently checked by the world fixture.
    const world = load(113);
    const arrivals = new Map(world.map.events.filter(entry =>
        entry && (entry.id === 13 || /^EnterSecretArea\d+$/.test(entry.name)))
        .map(entry => [entry.x + entry.y * world.map.width, entry]));
    const painted = new Set();
    let edits = 0;
    for (const entry of world.map.events) {
        for (const page of entry?.pages || []) {
            for (const command of page.list) {
                if (command.code !== 357 || command.parameters[0] !== 'Tyruswoo_TileControl' ||
                    command.parameters[1] !== 'set_tile') continue;
                const args = command.parameters[3];
                const { x, y, z } = JSON.parse(args.coordinates);
                const cell = Number(x) + Number(y) * world.map.width;
                const entrance = arrivals.get(cell);
                if (!entrance) continue;
                const native = world.gameMap._events[entrance.id];
                const index = cell + Number(z) * world.map.width * world.map.height;
                const prior = world.map.data[index];
                const marker = world.gameMap.readTileCode(args.tileId);
                world.gameMap._displayX = native._x - 3;
                world.gameMap._displayY = native._y - 3;
                const cueAtEntrance = () => categoryCue(root, world.gameMap, tilemap, native, entrance,
                    entrance.pages[0], { category: 'exits' });
                assert.equal(cueAtEntrance(), null, 'original terrain must not reveal the entrance');
                world.map.data[index] = marker;
                assert.equal(cueAtEntrance(), 'exit', 'native discovery graphic qualifies the entrance');
                world.map.data[index] = prior;
                painted.add(entrance.id);
                edits++;
            }
        }
    }
    assert.equal(edits, 25);
    assert.equal(painted.size, 24);

    // Compare the same loaded dense-map fixture, with and without due updates.
    const dense = load(41);
    f = setup(41, dense.gameMap._events.filter(event => event?.page()).map(event => event._eventId), 12, 12);
    function cadence(enabled) {
        soundscape.leave();
        options.soundscape.enabled = enabled;
        let peak = 0;
        let total = 0;
        for (let i = 0; i < 260; i++) {
            const start = performance.now();
            const time = ++root.Graphics.frameCount;
            if (enabled && (f.scene._wqaSoundscapeSample || !f.scene._wqaSoundscapeDue || time >= f.scene._wqaSoundscapeDue))
                soundscape.update(f.scene);
            sprites.emit('postrender');
            const elapsed = performance.now() - start;
            peak = Math.max(peak, elapsed);
            total += elapsed;
        }
        return { peak, total };
    }
    const off = cadence(false);
    const on = cadence(true);
    console.log('Verified ambient moving NPC, treasure, door, stairs, edge exit, checkpoints, discovery and cancellation. ' +
        `Dense fixture 260 frames off ${off.total.toFixed(2)} ms, on ${on.total.toFixed(2)} ms, ` +
        `peak ${on.peak.toFixed(2)} ms.`);
    soundscape.leave();
    delete root.$gameVariables._Community_Lighting_ScriptActive;
    delete root.$gameVariables._Community_Lighting_Radius;
}

module.exports = { verifySoundscape };
