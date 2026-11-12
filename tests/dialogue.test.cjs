'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, mapData } = require('./map-lifecycle.test.cjs');
const { formatSpeech } = require('../src/services/speech-text.cjs');
const { bakeMap } = require('../src/world/geometry.cjs');
const { findReachable } = require('../src/world/routes.cjs');

const methods = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning',
    path.join(__dirname, 'dialogue-producers.py'), process.argv[2]], { encoding: 'utf8', timeout: 6000, maxBuffer: 72000 }));

async function enter(map, mapId = 19, battle = false) {
    const f = fixture(map);
    const { c } = f;
    c.a2_0x990531 = () => { throw Error('Unresolved battle property'); };
    c.a9_0x3a9886 = () => { throw Error('Unresolved message owner property'); };
    c.Alias = {};
    c.Eli = { Utils: { spriteCharacters: {} } };
    c.Game_Message = function () {};
    c.Game_Picture = function () {};
    c.Sprite_Text = function () {};
    c.Game_Actor = function () {};
    c.Sprite_Character = function () {};
    c.Tilemap = function () {};
    c.Game_Character = function () {};
    Object.setPrototypeOf(c.Game_Character.prototype, c.Game_CharacterBase.prototype);
    Object.setPrototypeOf(c.Game_Event.prototype, c.Game_Character.prototype);
    c.Window_Message = function () {};
    c.Window_Selectable = function () {};
    c.Window_ChoiceList = function () {};
    c.Window_NumberInput = function () {};
    c.Scene_Battle = function () {};
    Object.setPrototypeOf(c.Scene_Battle.prototype, c.Scene_Message.prototype);
    c.Window = { prototype: c.Window_Base.prototype };
    Object.defineProperty(c.Window_Base.prototype, 'openness', {
        get() { return this._openness; }, set(value) { this._openness = Math.min(255, Math.max(0, value)); }
    });
    Object.setPrototypeOf(c.Window_Message.prototype, c.Window_Base.prototype);
    Object.setPrototypeOf(c.Window_Selectable.prototype, c.Window_Base.prototype);
    Object.setPrototypeOf(c.Window_ChoiceList.prototype, c.Window_Selectable.prototype);
    Object.setPrototypeOf(c.Window_NumberInput.prototype, c.Window_Selectable.prototype);
    for (const method of methods) f.run(method);
    c.Window_Base.prototype.update = function () { this.updateClose(); };
    c.Window_Selectable.prototype.update = function () {};

    const shown = [];
    const iconDraws = [];
    let triggered = false;
    let repeated = '';
    const settings = {
        text: '', speaker: '', choices: [], result: null, faceReady: false, number: null, initialNumber: 0,
        battleBusy: false, interpreter: null,
        allText() { return this.text; }, speakerName() { return this.speaker; },
        faceName: () => 'Synthetic face', isBusy() { return !!this.text || this.choices.length > 0 || !!this.number; },
        hasText() { return !!this.text; }, scrollMode: () => false, isChoice() { return this.choices.length > 0; },
        isNumberInput() { return !!this.number; }, isItemChoice: () => false, choiceDefaultType: () => 0,
        choiceCancelType: () => -2, onChoice(index) { assert.equal(f.epoch(), 0); this.result = index; },
        clear() { this.text = ''; this.choices = []; this.number = null; }
    };
    Object.setPrototypeOf(settings, c.Game_Message.prototype);
    // Stock accessors return the native data. Keep the fixture's editable copy
    // separate from the accessor so choices are handled by the real command builder.
    c.$gameMessage = Object.create(settings);
    c.$gameMessage.choices = () => settings.choices;
    c.$gameMessage.isBusy = () => settings.isBusy();
    c.$gameMessage.isChoice = () => settings.isChoice();
    c.$gameMessage.numInputMaxDigits = () => settings.number.digits;
    c.$gameMessage.numInputVariableId = () => settings.number.variable;
    c.$gameMessage.clear = () => settings.clear();
    c.$gameMessage.onChoice = index => settings.onChoice(index);
    c.$gameVariables = {
        value: id => id === 7 ? 23 : settings.initialNumber,
        setValue(id, value) { assert.equal(f.epoch(), 0); settings.result = { id, value }; }
    };
    c.Utils.containsArabic = () => false;
    c.ImageManager.faceWidth = 144;
    c.ImageManager.iconWidth = c.ImageManager.iconHeight = 36;
    c.ImageManager.loadSystem = () => ({});
    c.Input.update = () => assert.equal(f.epoch(), 0);
    c.Input.isRepeated = key => repeated === key;
    c.SceneManager.isNextScene = () => false;
    c.Time.GetDeltaTime = () => 1 / 60;
    c.GetActorColour = () => '#fff';
    c.SpriteTextAnimation = { FadeIn: {} };
    c.$gameSystem.playtimeText = () => '01:02:03';
    c.TextManager = { currencyUnit: 'gold' };
    const speaker = {
        _currentString: '', worldVisible: true, worldAlpha: 1,
        GetText() { return this._currentString; }, setText(text) { this._currentString = text; },
        setDrawColour() {}, RedrawText() {}, StartTextAnimation() { this._animationRunning = !!this._currentString; }
    };
    const contents = {
        height: 140, clear() {}, drawText(text) { shown.push(text); },
        blt(_asset, x, y, width) { iconDraws.push(x / width + y / width * 16); }
    };
    const window = Object.assign(new c.Window_Message(), {
        _nameSprite: speaker, _faceSprite: { alpha: 1 }, _goldWindow: { close() {} }, _eventItemWindow: {},
        contents, contentsOpacity: 255, worldVisible: true, worldAlpha: 1, openness: 0, pause: false,
        _waitCount: 0, checkToNotClose() {}, synchronizeNameBox() {}, isOpening: () => false,
        updatePlacement() {}, updateBackground() {}, updateBackgroundType() {}, drawMessageFace() {},
        loadMessageFace() { this._faceBitmap = { isReady: () => settings.faceReady }; },
        open() { this.openness = 255; this._closing = false; },
        resetFontSettings() {}, clearFlags() { this._showFast = this._lineShowFast = this._pauseSkip = false; },
        calcTextHeight: () => 28, textWidth: value => value.length, playTextSound() {},
        isTriggered: () => triggered, initNameSprite() {}, getNameColorIndex: () => 0,
        getNameVoiceIndex: () => 0, setTextSounds() {}, changeTextColor() {}
    });
    c.ColorManager = { textColor: () => '#fff' };
    const choice = Object.assign(new c.Window_ChoiceList(), {
        _messageWindow: window, _index: -1, worldVisible: true, worldAlpha: 1, contentsOpacity: 255, openness: 0,
        updatePlacement() {}, updateBackground() {}, placeCancelButton() {}, createContents() {}, scrollTo() {},
        open() { this.openness = 255; }, close() { this.openness = 0; this.active = false; },
        activate() { this.active = true; }, index() { return this._index; }, refreshCursor() {}, callUpdateHelp() {},
        refresh() { this._list = []; this.makeCommandList(); this._list.forEach((_, index) => this.drawItem(index)); },
        addCommand(name) { this._list.push(name); }, commandName(index) { return this._list[index]; },
        itemLineRect: index => ({ x: 0, y: 28 * index, width: 220 }),
        contents, calcTextHeight: () => 28, textWidth: value => value.length, resetFontSettings() {}
    });
    const number = Object.assign(new c.Window_NumberInput(), {
        _messageWindow: window, _index: -1, active: false, visible: true, worldVisible: true, worldAlpha: 1, contentsOpacity: 255,
        openness: 0, updatePlacement() {}, placeButtons() {}, createContents() {},
        open() { this.openness = 255; }, close() { this.openness = 0; },
        activate() { this.active = true; }, deactivate() { this.active = false; },
        index() { return this._index; }, refreshCursor() {}, callUpdateHelp() {},
        refresh() {
            this.drawn = '';
            for (let index = 0; index < this._maxDigits; index++) this.drawItem(index);
        },
        itemLineRect: index => ({ x: index * 48, y: 0, width: 48 }), resetTextColor() {},
        drawText(digit) { this.drawn += digit; }, playCursorSound() {}, playOkSound() {}, updateInputData() {}
    });
    window._choiceListWindow = choice;
    window._numberInputWindow = number;
    c.Scene_Message.prototype.update = function () { window.update(); number.update(); };
    c.$gameMap._nameDisplay = false;
    if (battle) {
        c.$gameTimer = { update() {} };
        c.$gameScreen.update = () => {};
        Object.assign(c.BattleManager, {
            _spriteset: { isBusy: () => settings.battleBusy }, _logWindow: { isBusy: () => !!settings.battleLogBusy },
            playBattleBgm() {}, startBattle() {}, isTpb: () => false,
            updateEvent: () => settings.interpreter?.updateWaitMode(),
            updatePhase() { assert.equal(f.epoch(), 0); }
        });
        Object.assign(c.Scene_Battle.prototype, {
            create() { this._windowLayer = {}; }, fadeSpeed: () => 2,
            startFadeIn() { this._fadeDuration = this._fadeOpacity = 2; },
            isBusy() { return this._fadeDuration > 0; },
            updateBattleProcess() { c.BattleManager.update(this.isTimeActive()); }
        });
        c.SceneManager.goto(c.Scene_Battle);
    } else {
        c.$gamePlayer.reserveTransfer(mapId, 8, 8, 2, 0);
        c.SceneManager.goto(c.Scene_Map);
    }
    c.SceneManager.changeScene();
    c.DataManager.ready = c.ImageManager.ready = true;
    c.SceneManager.updateScene();
    await new Promise(setImmediate);
    const scene = c.Graphics.app.stage;
    scene._messageWindow = window;
    window.parent = choice.parent = number.parent = scene._windowLayer;
    if (!battle) {
        scene._fadeDuration = scene._fadeOpacity = 0;
        c.SceneManager.updateScene();
        f.idleCallbacks.shift()();
    }

    function tick(render = true) {
        c.SceneManager.updateScene();
        if (render) f.frame();
    }
    function until(predicate, render = true) {
        for (let frame = 0; frame < 500; frame++) {
            if (predicate()) return;
            tick(render);
        }
        assert.fail('Native message did not reach the expected boundary');
    }
    function advance() {
        window._waitCount = 0;
        triggered = true;
        tick();
        triggered = false;
    }
    function pressDigit(key) {
        repeated = key;
        tick();
        repeated = '';
    }
    const packets = () => f.packets.filter(packet => ['dialoguePage', 'dialogueChoice', 'numberEntry'].includes(packet.kind));
    return { ...f, scene, window, choice, number, settings, speaker, shown, iconDraws, tick, until, advance, pressDigit,
        records: f.packets, packets };
}

function authoredPage(commands, first = commands.findIndex(command => command.code === 101)) {
    assert(first >= 0);
    let end = first + 1;
    while (commands[end]?.code === 401) end++;
    return { text: commands.slice(first + 1, end).map(command => command.parameters[0]).join('\n'),
        speaker: commands[first].parameters[4] || '', choices: commands[end]?.code === 102 ? commands[end].parameters[0] : [] };
}

function enableNativeMessage({ c, settings }) {
    settings.faceReady = true;
    c.$gameMessage.setFaceImage = c.$gameMessage.setBackground = c.$gameMessage.setPositionType = () => {};
    c.$gameMessage.setSpeakerName = name => { settings.speaker = name; };
    c.$gameMessage.add = text => { settings.text += (settings.text ? '\n' : '') + text; };
}

function tapPuzzleKey(f, key, modifiers = {}) {
    let prevented = false;
    const code = 'Key' + key.toUpperCase();
    f.dispatchWindowEvent('keydown', { key, code, keyCode: key.toUpperCase().charCodeAt(0), ...modifiers,
        preventDefault() { prevented = true; }, stopPropagation() {} });
    f.dispatchWindowEvent('keyup', { key, code });
    return prevented;
}

function installInterpreterConstructor(c) {
    const prototype = c.Game_Interpreter.prototype;
    c.Game_Interpreter = function (depth) { this.initialize(depth); };
    c.Game_Interpreter.prototype = prototype;
    c.$gameMap._interpreter.initialize();
}

async function verifyNumberEntry() {
    const common = JSON.parse(fs.readFileSync(path.join(process.argv[2], 'package.nw', 'data', 'CommonEvents.json'), 'utf8'));
    const commands = common[98].list;
    const [variable, digits] = commands.find(command => command.code === 103).parameters;
    const f = await enter(mapData(187), 187);
    Object.assign(f.settings, authoredPage(commands), { faceReady: true, initialNumber: 4, number: { variable, digits } });
    f.number.worldAlpha = 0;
    f.until(() => f.number.active);
    f.speaker._animationRunning = false;
    f.tick();
    assert.deepEqual(f.packets().map(packet => packet.kind), ['dialoguePage']);
    f.number.worldAlpha = 1;
    f.tick();
    assert.equal(f.number.drawn, '04');
    assert.equal(formatSpeech(f.packets()[1]), 'Number entry. 0, 4. Digit 1 of 2, 0');
    assert.equal(f.packets()[1].append, true);
    assert.equal(f.number.isCancelEnabled(), false);

    f.pressDigit('down');
    assert.equal(f.number.drawn, '94');
    assert.equal(formatSpeech(f.packets().at(-1)), 'Digit 1 of 2, 9');
    f.pressDigit('up');
    assert.equal(f.number.drawn, '04');
    assert.equal(formatSpeech(f.packets().at(-1)), 'Digit 1 of 2, 0');
    f.number.select(1);
    f.tick();
    assert.equal(formatSpeech(f.packets().at(-1)), 'Digit 2 of 2, 4');
    f.number.onButtonUp();
    f.tick();
    assert.equal(f.number.drawn, '05');
    assert.equal(formatSpeech(f.packets().at(-1)), 'Digit 2 of 2, 5');
    f.number.onButtonOk();
    assert.equal(f.epoch(), 0);
    assert.deepEqual(f.settings.result, { id: variable, value: 5 });

    const map = mapData(185);
    const standalone = await enter(map, 185);
    const parameters = map.events[3].pages[0].list.find(command => command.code === 103).parameters;
    standalone.settings.number = { variable: parameters[0], digits: parameters[1] };
    standalone.settings.initialNumber = 9999;
    standalone.until(() => standalone.packets().length === 1);
    assert.equal(standalone.number.drawn, '999');
    assert.equal(formatSpeech(standalone.packets()[0]), 'Number entry. 9, 9, 9. Digit 1 of 3, 9');
    assert.equal(standalone.packets()[0].append, false);
}

async function verifyMapDiagrams() {
    const installed = path.join(process.argv[2], 'package.nw');
    const events = JSON.parse(fs.readFileSync(path.join(installed, 'data/CommonEvents.json'), 'utf8'));
    const data = mapData(87);
    const f = await enter(data, 87);
    const { c, scene, window } = f;
    c.$dataCommonEvents = events;
    const pictures = c.$gameScreen._pictures = [];
    const spriteset = scene._spriteset = { parent: scene };
    const layer = spriteset._pictureContainer_upper = { parent: spriteset, children: [] };
    Object.assign(c.Graphics, { width: 640, height: 360 });
    enableNativeMessage(f);
    installInterpreterConstructor(c);
    const interpreter = c.$gameMap._interpreter;
    const diagramPackets = () => f.records.filter(packet => packet.kind === 'mapBanner' || packet.kind === 'menuDetails' ||
        packet.kind === 'menuReview');

    function picture(list, command, x, y, alpha = 1) {
        const descriptor = list[command].parameters[3];
        const id = Number(descriptor.id);
        const name = descriptor.pictureName;
        const png = fs.readFileSync(path.join(installed, 'img', name + '.png'));
        const sprite = {
            _pictureId: id, _pictureName: name, parent: layer, worldVisible: true, worldAlpha: alpha,
            bitmap: { isReady: () => true }, texture: { valid: true }, anchor: { x: 0.5, y: 0.5 },
            worldTransform: { tx: x, ty: y, a: 1, d: 1, b: 0, c: 0 },
            _frame: { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
        };
        pictures[id] = { _name: name, _duration: 0 };
        layer.children.push(sprite);
        return sprite;
    }
    function wait(list, index) {
        Object.assign(interpreter, { _mapId: 87, _eventId: 121, _list: list, _index: index });
        assert(interpreter.executeCommand());
        assert.equal(interpreter._waitMode, 'message');
        assert.equal(c.$gameMessage.interpreter, interpreter);
        window.openness = 255;
        window.contentsOpacity = 0;
        window.pause = true;
    }

    const cavern = events[101].list;
    const base = picture(cavern, 30, 320, 180);
    picture(cavern, 45, 320, 180);
    picture(cavern, 62, 320, 180, 0);
    picture(cavern, 79, 320, 180);
    picture(cavern, 110, 220, 235);
    wait(cavern, 192);
    base.texture.valid = false;
    f.tick();
    assert.equal(diagramPackets().length, 0);
    base.texture.valid = true;
    f.tick(false);
    assert.equal(diagramPackets().length, 0);
    f.frame();
    assert.equal(formatSpeech(diagramPackets()[0]), 'Caffeine Caverns map, 2 pathways shown');
    assert.equal(diagramPackets().length, 1, 'Autodetail defaults off');
    assert(tapPuzzleKey(f, 'i'));
    const details = formatSpeech(diagramPackets().at(-1));
    assert.match(details, /Wendy marker, southwest/);
    assert.match(details, /Pathway 1/);
    assert.match(details, /Pathway 3/);
    assert.doesNotMatch(details, /Pathway 2/);
    const review = { key: 'ArrowRight', code: 'ArrowRight', shiftKey: true, preventDefault() {}, stopPropagation() {} };
    f.dispatchWindowEvent('keydown', review);
    f.dispatchWindowEvent('keyup', review);
    assert.match(formatSpeech(diagramPackets().at(-1)), /^Pathway 3/);
    f.advance();
    assert.equal(scene._wqaDiagramShown, false);
    assert.equal(tapPuzzleKey(f, 'i'), false);

    pictures.length = layer.children.length = 0;
    const atlas = events[142].list;
    picture(atlas, 17, 320, 180);
    picture(atlas, 45, 315, 165);
    const marked = events[161].list;
    const marker = marked.findIndex(command => command.code === 357 &&
        command.parameters[3]?.pictureName === 'system/MapMarkers/Map Markers1');
    assert(marker >= 0);
    picture(marked, marker, 410, 110);
    wait(events[166].list, 59);
    f.tick();
    assert.equal(formatSpeech(diagramPackets().at(-1)), 'World Atlas, southwest ruins map');
    assert(tapPuzzleKey(f, 'i'));
    assert.match(formatSpeech(diagramPackets().at(-1)), /Crossed-out ruin location, northeast/);
    pictures[27]._name = 'Other picture';
    assert.equal(tapPuzzleKey(f, 'i'), false);
    f.advance();

    const { localDestination } = require('../src/world/local-destinations');
    assert.deepEqual(localDestination({ $gameMap: { _mapId: 87 } },
        { _eventId: 130, _trigger: 0 }, data.events[130].pages[0]),
        { name: 'Map board', category: 'objects' });
}

async function verifyCredits() {
    const f = await enter(mapData(189), 189);
    const { c, scene } = f;
    c.PIXI = { BLEND_MODES: { NORMAL: 0 } };
    c.GetEvent = () => null;
    c.Game_Picture.prototype.show = function (_name, _origin, _x, _y, _scaleX, _scaleY, opacity) {
        this._opacity = opacity;
        this._duration = 0;
    };
    c.Game_Picture.prototype.setLayer = c.Game_Picture.prototype.setPositionSpace = () => {};
    c.$gameScreen.realPictureId = id => id;
    const pictures = c.$gameScreen._pictures = [];
    const spriteset = scene._spriteset = { parent: scene };
    const layer = spriteset._pictureContainer_upper = { parent: spriteset, children: [] };
    Object.assign(c.Graphics, { width: 640, height: 360, frameCount: 100 });
    const list = mapData(189).events[1].pages[0].list;
    c.$gameMap._mapId = 189;
    c.$gameMap._interpreter._list = list;
    const spoken = () => f.packets().map(formatSpeech);

    function textCard(command, index) {
        assert.equal(command.parameters[1], 'SetPictureText');
        const args = command.parameters[3];
        const id = Number(args.id);
        c.wqaFixturePictureText(args);
        const sprite = { _pictureId: id, parent: layer, worldVisible: true, worldAlpha: 1 };
        const text = sprite._textSprite = Object.assign(new c.Sprite_Text(), {
            parent: sprite, worldVisible: true, worldAlpha: 1,
            worldTransform: { tx: 4.48 * Number(args.positionX), ty: 3.6 * Number(args.positionY) },
        });
        text.setText(pictures[id]._text);
        text._dirty = false;
        text.children = text._currentString.split('').filter(character => character !== '\n').map(() => ({
            parent: text, worldVisible: true, worldAlpha: 1, scale: { x: 1, y: 1 }, bitmap: { isReady: () => true }
        }));
        layer.children[index] = sprite;
        return text;
    }

    const heading = textCard(list[30], 0);
    const body = textCard(list[46], 1);
    assert(body._currentString.includes('\n'));
    body.children[0].scale.x = 0;
    f.tick(false);
    assert.deepEqual(spoken(), [], 'Wait for render even when native opacity is settled');
    f.frame();
    const headSpeech = formatSpeech({ kind: 'dialoguePage', text: heading._currentString });
    const bodySpeech = formatSpeech({ kind: 'dialoguePage', text: body._currentString });
    assert.deepEqual(spoken(), [headSpeech]);
    for (let index = 0; index < 53; index++) {
        c.Graphics.frameCount++;
        f.tick();
    }
    assert.deepEqual(spoken(), [headSpeech], 'Long-hidden glyphs cannot speak');
    body.children[0].scale.x = 1;
    c.Graphics.frameCount += 4;
    f.tick();
    assert.deepEqual(spoken(), [headSpeech, bodySpeech]);
    assert.equal(f.packets()[1].append, true);
    f.tick();
    assert.equal(spoken().length, 2, 'An unchanged visible model does not repeat automatically');
    assert(tapPuzzleKey(f, 'i'));
    assert(spoken().at(-1).includes(bodySpeech));
    const review = { key: 'ArrowRight', code: 'ArrowRight', shiftKey: true, preventDefault() {}, stopPropagation() {} };
    f.dispatchWindowEvent('keydown', review);
    f.dispatchWindowEvent('keyup', review);
    assert.equal(f.records.at(-1).name, body._currentString.split('\n').at(-1).trim());
    const beforeRepeat = spoken().length;
    assert.equal(tapPuzzleKey(f, 'r'), false, 'Repeat leaves the native key unconsumed');
    assert.equal(spoken().length, beforeRepeat + 1);
    assert(spoken().at(-1).includes(bodySpeech));
    pictures[4]._duration = pictures[5]._duration = 1;
    f.tick();
    assert.equal(tapPuzzleKey(f, 'i'), false, 'A fading card hands control back');
    assert.equal(f.epoch(), 0);

    c.$gameMap._mapId = 239;
    const ending = mapData(239).events[1].pages[0].list;
    c.$gameMap._interpreter._list = ending;
    const command = ending.find(item => item.code === 357 && item.parameters[3]?.pictureName === 'pictures/TheEnd');
    assert(command);
    const data = command.parameters[3];
    const id = Number(data.id);
    pictures[id] = { _name: data.pictureName, _opacity: 255, _duration: 0 };
    const title = layer.children[2] = {
        _pictureId: id, _pictureName: data.pictureName, parent: layer, worldVisible: true, worldAlpha: 1,
        bitmap: { isReady: () => true }, texture: { valid: false }, anchor: { x: 0.5, y: 0.5 },
        worldTransform: { tx: 320, ty: 180, a: 1, d: 1, b: 0, c: 0 }
    };
    const before = spoken().length;
    f.tick();
    assert.equal(spoken().length, before);
    title.texture.valid = true;
    c.$gameScreen._brightness = 0;
    f.tick();
    assert.equal(spoken().length, before);
    c.$gameScreen._brightness = 255;
    c.Graphics.frameCount += 4;
    f.tick();
    assert.equal(spoken().at(-1), 'The end');
    pictures[id] = { ...pictures[id] };
    f.tick();
    assert.equal(spoken().slice(before).join(' / '), 'The end / The end', 'A distinct native card can repeat the same text');
    delete pictures[id];
    f.tick();
    assert.equal(f.epoch(), 0, 'Erasing the card retires its speech context');
}

async function verifyChamberChestHint() {
    const map = mapData(197);
    const f = await enter(map, 197);
    const { c, window, speaker } = f;
    c.$dataCommonEvents = JSON.parse(fs.readFileSync(path.join(process.argv[2], 'package.nw', 'data', 'CommonEvents.json'), 'utf8'));
    enableNativeMessage(f);
    installInterpreterConstructor(c);
    const root = c.$gameMap._interpreter;
    Object.assign(root, { _mapId: 197, _eventId: 2, _index: 2, _list: map.events[2].pages[0].list });
    assert(root.executeCommand());
    const source = root._childInterpreter;
    const hint = c.$dataCommonEvents[42].list;
    assert.equal(source._list, hint);
    c.$gameVariables.value = id => ({ 54: 25, 55: 24, 57: 'Fixture stat' })[id] ?? 0;
    source._index = hint.findIndex(command => command.code === 101);
    assert(source.executeCommand());
    assert.equal(c.$gameMessage.interpreter, source);
    window.worldAlpha = 0;
    f.until(() => window.pause);
    speaker._animationRunning = false;
    f.tick();
    assert.equal(f.packets().length, 0);
    window.worldAlpha = 1;
    f.tick();
    assert.equal(f.packets().length, 1);
    const lines = f.packets()[0].text.trim().split('\n');
    assert.equal(lines.join(''), f.shown.join('').trim());
    assert.equal(lines.length, 2);
    assert.match(lines[0], /Fixture stat.*24/i);
    assert.match(lines[1], /25/);
}

async function verifySaltGuide() {
    const data = mapData(19);
    const f = await enter(data);
    const { c, scene, window, speaker } = f;
    const map = c.$gameMap;
    const interpreter = map._interpreter;
    const player = c.$gamePlayer;
    Object.assign(map, { _mapId: 19, _tilesetId: data.tilesetId, _events: [], _tileEvents: [], _vehicles: [] });
    c.$dataTilesets = JSON.parse(fs.readFileSync(path.join(process.argv[2], 'package.nw', 'data', 'Tilesets.json'), 'utf8'));
    for (const id of [19, 20, 21, 22, 35, 36, 49, 68, 97, 114, 115, 120]) {
        const entry = data.events[id];
        const page = entry.pages[0];
        map._events[id] = Object.assign(f.event(id, 0), { _x: entry.x, _y: entry.y, _pageIndex: 0,
            _trigger: page.trigger, _priorityType: page.priorityType, _through: page.through });
    }
    player._vehicleType = 'walk';
    player.setPosition(26, 12);
    enableNativeMessage(f);
    interpreter._list = null;
    const key = (key, modifiers) => tapPuzzleKey(f, key, modifiers);
    const status = () => f.records.filter(packet => packet.kind === 'fieldStatus').map(formatSpeech);
    const review = () => {
        f.tick();
        assert(scene._wqaFieldReady);
        assert(key('g', { shiftKey: true }));
        f.frame();
        return status().at(-1);
    };
    function play(id, page, index, source = interpreter) {
        const count = f.packets().length;
        Object.assign(source, { _eventId: id, _mapId: 19, _index: index, _list: data.events[id].pages[page].list });
        assert(source.executeCommand());
        assert.equal(c.$gameMessage.interpreter, source);
        assert.equal(source._waitMode, 'message');
        f.until(() => window.pause);
        speaker._animationRunning = false;
        f.tick();
        if (window.worldAlpha > 0) assert(f.packets().length > count, `No native paint for ${id} at ${source._index}`);
    }
    function advance(source = interpreter) {
        f.advance();
        source._list = interpreter._list = null;
    }
    assert.equal(c.Input.keyMapper[71], undefined);
    assert.equal(key('g'), false, 'bare G remains available to native or currency controls');
    assert.equal(key('g', { ctrlKey: true }), false, 'inactive stop passes through');
    assert.equal(key('g', { shiftKey: true, ctrlKey: true }), false, 'mixed modifiers pass through');
    c.Input.keyMapper[71] = 'fixtureNative';
    assert.equal(key('g', { shiftKey: true }), false);
    delete c.Input.keyMapper[71];
    assert.match(review(), /Wall clue selected/);
    key('k');
    f.frame();
    const request = f.routePackets.at(-1);
    const geometry = bakeMap(data, c.$dataTilesets[data.tilesetId].flags);
    f.routeReply({ sequence: request.sequence, epoch: request.epoch, map: request.map,
        result: findReachable(geometry, request.live, request.request) });
    f.frame();
    assert.equal(formatSpeech(f.records.filter(packet => packet.kind === 'fieldTarget').at(-1)), 'Wall clue, 1 south');

    window.worldAlpha = 0;
    play(114, 0, 4);
    advance();
    window.worldAlpha = 1;
    assert.match(review(), /Wall clue selected/, 'a clue with no rendered page cannot reveal its order');
    play(115, 0, 4);
    assert(key('g', { ctrlKey: true }), 'stop works while the game dialogue owns the screen');
    assert.equal(key('g', { ctrlKey: true }), false);
    advance();
    const order = /Wall clue order: ([^.]+)\./.exec(review())[1].split(', ');
    assert.equal(order.length, 4);
    assert.equal(new Set(order).size, 4);

    play(19, 0, 22);
    advance();
    assert.match(review(), new RegExp('Lights observed this visit: ' + order[0]));
    play(97, 0, 49);
    assert.equal(interpreter._index, 51);
    assert(window._wqaDialoguePaint, 'reset line remains visibly waiting');
    assert.equal(window._wqaDialoguePaint.end, window._wqaDialoguePaint.text.length);
    assert.equal(f.packets().at(-1).text, window._wqaDialoguePaint.text);
    assert(!scene._wqaTerrainWork);
    advance();
    assert.match(review(), /The crystals were reset/);
    assert.doesNotMatch(status().at(-1), /Lights observed/);

    interpreter._childInterpreter = null;
    interpreter.setupChild = (list, id) => {
        interpreter._childInterpreter = Object.assign(new c.Game_Interpreter(), { _eventId: id, _list: list });
    };
    c.ExecuteEvent(97, 1);
    const reset = interpreter._childInterpreter;
    assert.equal(reset._list, data.events[97].pages[0].list);
    play(97, 0, 49, reset);
    advance(reset);
    interpreter._childInterpreter = null;
    assert.match(review(), /The crystal attempt reset/);

    play(35, 1, 19);
    advance();
    assert.match(review(), /The ordered crystals opened a passage/);
    play(68, 0, 81);
    advance();
    assert.match(review(), /A crystal changed the passage to the exit/);
    assert(key('g', { ctrlKey: true }));
    f.frame();
    assert.equal(status().at(-1), 'Puzzle guidance stopped');
    assert.equal(key('g', { ctrlKey: true }), false);
    assert(key('g', { shiftKey: true }));
    assert(key('g', { ctrlKey: true }), 'stop retires a guide request queued for rendering');
    f.frame();
    assert.equal(status().at(-1), 'Puzzle guidance stopped');

    // Run the stock interpreter on the actual authored crystal interactions.
    // Only native audio and graphics commands are stand-ins in this branch test.
    const variables = new Map();
    const switches = new Map();
    c.$gameVariables.value = id => variables.get(id) || 0;
    c.$gameVariables.setValue = (id, value) => variables.set(id, value);
    c.$gameSwitches = { value: id => switches.get(id) === true, setValue: (id, value) => switches.set(id, value) };
    delete interpreter.setupChild;
    installInterpreterConstructor(c);
    c.Game_Interpreter.prototype.command357 = ([plugin, , , args]) => {
        if (plugin === 'MonkeyWrenchMZ') c.ExecuteEvent(Number(args.eventID), Number(args.pageID));
        return true;
    };
    function runAction(id) {
        interpreter.setup(data.events[id].pages[0].list, id);
        const stack = [interpreter];
        for (let budget = 256; stack.length && budget > 0; budget--) {
            const source = stack.at(-1);
            if (!source.currentCommand()) {
                stack.pop();
                if (stack.length) stack.at(-1)._childInterpreter = null;
                continue;
            }
            assert(source.executeCommand());
            if (source._childInterpreter) stack.push(source._childInterpreter);
            else if (source._waitMode === 'message') {
                f.until(() => window.pause);
                speaker._animationRunning = false;
                f.tick();
                f.advance();
                assert.equal(source.updateWaitMode(), false);
            }
        }
        assert.equal(stack.length, 0, 'crystal script completed within its fixture command budget');
        interpreter._list = null;
    }
    const progress = id => data.events[id].pages[0].list.find(command =>
        command.code === 111 && command.parameters[0] === 1 && command.parameters[4] === 0).parameters;
    const crystals = [19, 20, 21, 22].sort((a, b) => progress(a)[3] - progress(b)[3]);
    const variable = progress(crystals[0])[1];
    runAction(crystals[1]);
    assert.equal(c.$gameVariables.value(variable), 0);
    assert.match(review(), /The crystal attempt reset/);
    for (const [stage, id] of crystals.entries()) {
        runAction(id);
        assert.equal(c.$gameVariables.value(variable), stage + 1);
    }
    assert.match(review(), /Lights observed this visit: [^.]+, [^.]+, [^.]+, [^.]+\./);
    runAction(97);
    assert.equal(c.$gameVariables.value(variable), 0);
    assert.match(review(), /The crystals were reset/);
    assert.doesNotMatch(status().at(-1), /Lights observed/);
    map._mapId = 187;
    assert.equal(key('g', { shiftKey: true }), false);
}

async function verifyCaveGuide() {
    const data = mapData(196);
    const common = JSON.parse(fs.readFileSync(path.join(process.argv[2], 'package.nw', 'data', 'CommonEvents.json'), 'utf8'));

    function selectRoom(f, room, scene, id, x, y) {
        const { c } = f;
        c.$gameMap._mapId = id;
        c.$gameMap._events = room.events.map(entry => {
            if (!entry) return null;
            const page = entry.pages[0];
            return Object.assign(new c.Game_Event(), { _eventId: entry.id, _x: entry.x, _realX: entry.x,
                _y: entry.y, _realY: entry.y, _pageIndex: 0, _trigger: page.trigger,
                _priorityType: page.priorityType, _through: page.through, _moveRoute: page.moveRoute, _moveRouteIndex: 0,
                _moveSpeed: page.moveSpeed, _moveFrequency: page.moveFrequency, _direction: page.image.direction,
                _moveType: page.moveType, _stopCount: 0, _waitCount: 0, _jumpCount: 0 });
        });
        c.$gamePlayer._vehicleType = 'walk';
        c.$gamePlayer.setPosition(x, y);
        scene._spriteset = { _tilemap: Object.assign(new c.Tilemap(), { tileWidth: 32, tileHeight: 32,
            origin: { x: 0, y: 0 }, _mapWidth: room.width, _mapHeight: room.height,
            _mapData: new Uint8Array(room.width * room.height * 4), flags: [0, 16] }) };
    }
    function paintPatrol(c, scene, patrol, x) {
        const sprite = Object.assign(new c.Sprite_Character(), { _character: patrol, parent: scene._spriteset._tilemap,
            texture: { valid: true, orig: { width: 48, height: 48 } }, anchor: { x: 0.5, y: 1 },
            worldAlpha: 1, worldVisible: true, renderable: true, worldTransform: { tx: x, ty: 50 },
            transform: { localTransform: { a: 1, b: 0, c: 0, d: 1, tx: x, ty: 50 } } });
        sprite.setMapSprite(patrol);
        return sprite;
    }

    const describe = f => f.records.filter(record => record.kind === 'fieldStatus').map(formatSpeech);
    const review = f => {
        f.tick();
        assert(tapPuzzleKey(f, 'g', { shiftKey: true }));
        f.frame();
        return describe(f).at(-1);
    };
    function speak(f, source) {
        assert(source.executeCommand());
        f.until(() => f.window.pause);
        f.speaker._animationRunning = false;
        f.tick();
    }
    async function moveToReservedMap(f, xAdjust = 0) {
        const { c } = f;
        const { _newMapId: id, _newX: x, _newY: y } = c.$gamePlayer;
        const room = mapData(id);
        c.Scene_Map.prototype.isBusy = () => false;
        c.Scene_Map.prototype.terminate = c.Scene_Map.prototype.destroy = () => {};
        c.SceneManager.goto(c.Scene_Map);
        c.SceneManager.changeScene();
        c.$dataMap = room;
        c.SceneManager.updateScene();
        await new Promise(setImmediate);
        const scene = c.Graphics.app.stage;
        selectRoom(f, room, scene, id, x + xAdjust, y);
        return scene;
    }
    function settle(f, scene) {
        scene._fadeDuration = scene._fadeOpacity = 0;
        f.c.SceneManager.updateScene();
        f.idleCallbacks.shift()?.();
        f.tick();
    }

    {
        const room = mapData(206);
        const f = await enter(room, 206);
        const { c, scene } = f;
        const map = c.$gameMap;
        c.$gameParty = { inBattle: () => false };
        installInterpreterConstructor(c);
        selectRoom(f, room, scene, 206, 17, 7);
        assert.match(review(f), /Cave entrance selected/);
        const event = map._events[11];
        const list = room.events[11].pages[0].list;
        Object.assign(event, { _starting: true, eventId: () => 11, list: () => list });
        map.fixtureEvents = [event];
        assert(map.setupStartingMapEvent());
        assert(c.Graphics._wqaCaveProgressPending);
        assert.equal(f.epoch(), 0, 'event setup retires the previous review');
        map.fixtureEvents = [];
        const source = map._interpreter;
        source._index = 2;
        assert(source.executeCommand());
        const landed = await moveToReservedMap(f);
        assert(c.Graphics._wqaCaveProgressPending, 'the transfer retains the pending result until settlement');
        assert(!tapPuzzleKey(f, 'g', { shiftKey: true }));
        source._list = null;
        settle(f, landed);
        assert(!c.Graphics._wqaCaveProgressPending);
        assert.match(review(f), /Entered the patrol rooms/);
        assert(!describe(f).some(line => line === 'Entered the patrol rooms.'), 'arrival waits for guide review');
    }

    for (const scenario of [
        { checkpoint: 0 }, { checkpoint: 1 }, { checkpoint: 2 }, { checkpoint: 3 },
        { checkpoint: 1, stop: true }, { checkpoint: 1, wrongLanding: true }
    ]) {
        const f = await enter(data, 196);
        const { c, scene, renderer } = f;
        const map = c.$gameMap;
        c.$dataCommonEvents = common;
        c.$gameParty = { inBattle: () => false };
        c.$gameSwitches = { setValue() {} };
        const variableId = common[102].list[32].parameters[1];
        c.$gameVariables.value = id => id === variableId ? scenario.checkpoint : 0;
        enableNativeMessage(f);
        installInterpreterConstructor(c);
        selectRoom(f, data, scene, 196, 10, 43);
        renderer.screen = { width: 320, height: 200 };
        assert.match(review(f), /Warning sign selected/);
        const interpreter = map._interpreter;
        if (scenario.checkpoint === 0) {
            const player = c.$gamePlayer;
            const patrol = map._events[4];
            c.$dataTilesets = JSON.parse(fs.readFileSync(path.join(process.argv[2], 'package.nw', 'data', 'Tilesets.json'), 'utf8'));
            Object.assign(map, { _tilesetId: data.tilesetId, _tileEvents: [], _vehicles: [] });
            tapPuzzleKey(f, 'p');
            f.frame();
            const warningRoute = f.routePackets[0];
            assert.equal(warningRoute.request.event, 2);
            assert.deepEqual(warningRoute.request.area, [6, 38, 22, 51]);
            patrol._moveRouteForcing = true;
            f.routeReply({ sequence: warningRoute.sequence, epoch: warningRoute.epoch, map: warningRoute.map,
                result: { status: 'ready', legs: [], arrival: { facing: 8 } } });
            f.frame();
            assert.match(describe(f).at(-1), /Warning sign directions are no longer available/);
            patrol._moveRouteForcing = false;
            player.setPosition(6, 26);
            f.tick();
            Object.assign(c.Graphics, { width: 640, height: 360, frameCount: 100 });
            Object.assign(map, { _displayX: 0, _displayY: 20, _commonEvents: [] });
            player._moveSpeed = 4;
            tapPuzzleKey(f, 'p');
            f.frame();
            assert.equal(f.routePackets.length, 1, 'a native parallel event leaves timing unavailable');
            assert.match(describe(f).at(-1), /Patrol timing is unavailable/);
            for (const event of map._events) if (event?._trigger === 4) event._erased = true;
            const timedReply = age => {
                tapPuzzleKey(f, 'p');
                f.frame();
                const queued = f.routePackets.at(-1);
                assert(queued.request.motion?.patrols.length > 0);
                assert.equal(queued.request.motion.frame, c.Graphics.frameCount);
                c.Graphics.frameCount += age;
                f.routeReply({ sequence: queued.sequence, epoch: queued.epoch, map: queued.map,
                    result: { status: 'timed', tiles: 2, direction: 2, startWindow: 60 } });
                f.frame();
                return queued.request.motion.frame;
            };
            timedReply(45);
            assert.match(describe(f).at(-1), /Patrol timing changed/);
            const started = timedReply(2);
            assert.equal(formatSpeech(f.records.at(-1)), 'Preview. 2 steps south. Recheck if you wait.');
            assert(f.epoch());
            c.Graphics.frameCount = started + 60;
            f.tick();
            assert.equal(f.epoch(), 0, 'native clock expiration closes preview speech admission');
            const sprite = paintPatrol(c, scene, patrol, -1);
            assert.match(review(f), /No patrol in view/);
            sprite.worldTransform.tx = 75;
            sprite.transform.localTransform.tx = 75;
            sprite.parent = {};
            assert.match(review(f), /No patrol in view/);
            sprite.parent = scene._spriteset._tilemap;
            sprite.texture.valid = false;
            assert.match(review(f), /No patrol in view/);
            sprite.texture.valid = true;
            const cover = 2 + data.width;
            scene._spriteset._tilemap._mapData[cover] = 1;
            assert.match(review(f), /No patrol in view/);
            scene._spriteset._tilemap._mapData[cover] = 0;
            patrol._pageIndex = 1;
            assert.match(review(f), /No patrol in view/);
            patrol._pageIndex = 0;
            assert(tapPuzzleKey(f, 'g', { shiftKey: true }));
            patrol.setPosition(4, 25);
            patrol._realY = 24.5;
            f.frame();
            assert.match(describe(f).at(-1), /Closest patrol at this check: 2 west, 2 north, moving south/);
            const beforeMove = describe(f).length;
            assert(tapPuzzleKey(f, 'g', { shiftKey: true }));
            player.setPosition(6, 27);
            f.frame();
            assert.equal(describe(f).length, beforeMove, 'player movement retires a queued review');
            assert.match(review(f), /Closest patrol at this check/);
            assert(f.epoch());
            const checkpoint = data.events[21].pages[0].list;
            interpreter.setup(checkpoint, 21);
            assert.equal(f.epoch(), 0, 'native event entry closes cave review before resource preload');
            interpreter._index = checkpoint.findIndex(command => command.code === 101);
            speak(f, interpreter);
            f.advance();
            interpreter._list = null;
            assert.match(review(f), /Checkpoint reached/);
        }
        interpreter.setup(data.events[4].pages[0].list, 4);
        assert(interpreter.executeCommand());
        const recovery = interpreter._childInterpreter;
        assert.equal(recovery._list, common[102].list);
        recovery._index = recovery._list.findIndex(command => command.code === 101);
        speak(f, recovery);
        assert(c.Graphics._wqaCaveRecoveryPending);
        f.advance();
        recovery._index = recovery._list.findIndex(command => command.code === 201);
        assert(recovery.executeCommand());
        assert.equal(f.epoch(), 0, 'the capture transfer closes the speech epoch');
        const interstitial = await moveToReservedMap(f);
        assert.equal(c.$gameMap._mapId, 198);
        settle(f, interstitial);
        if (scenario.stop) {
            assert(tapPuzzleKey(f, 'g', { ctrlKey: true }), 'an active guide can be stopped during recovery');
            assert(!c.Graphics._wqaCaveRecoveryPending);
        } else assert(c.Graphics._wqaCaveRecoveryPending, 'the interstitial cannot publish a landing');
        for (let step = 0; step < 24 && !c.$gamePlayer.isTransferring(); step++) assert(recovery.executeCommand());
        assert(c.$gamePlayer.isTransferring());
        const landed = await moveToReservedMap(f, scenario.wrongLanding ? 1 : 0);
        assert(!tapPuzzleKey(f, 'g', { shiftKey: true }), 'fade owns the field during recovery');
        interpreter._list = null;
        settle(f, landed);
        const result = review(f);
        assert(!c.Graphics._wqaCaveRecoveryPending);
        if (scenario.stop || scenario.wrongLanding) assert.doesNotMatch(result, /after capture/);
        else assert.match(result, scenario.checkpoint ? /Returned to a checkpoint after capture/ : /Returned after capture/);
    }

    for (const [id, sourceId, pageIndex, patrolId, expected] of [
        [200, 5, 0, 4, /responding to a distraction/],
        [200, 10, 0, 9, /responding to a distraction/],
        [200, 19, 0, 16, /responding to a distraction/],
        [200, 19, 1, 16, /returning to patrol/],
        [201, 4, 0, 3, /giving chase/]
    ]) {
        const room = mapData(id);
        const f = await enter(room, id);
        const { c, scene, renderer } = f;
        const map = c.$gameMap;
        c.$gameParty = { inBattle: () => false };
        installInterpreterConstructor(c);
        selectRoom(f, room, scene, id, room.events[patrolId].x + 1, room.events[patrolId].y);
        map.event = id => map._events[id];
        const patrol = map._events[patrolId];
        renderer.screen = { width: 320, height: 200 };
        const sprite = paintPatrol(c, scene, patrol, 75);
        const interpreter = map._interpreter;
        const commands = room.events[sourceId].pages[pageIndex].list;
        interpreter.setup(commands, sourceId);
        // The first crystal's jump precedes its actual distraction route.
        interpreter._index = commands.findLastIndex(command => command.code === 205 && command.parameters[0] === patrolId);
        assert(interpreter.executeCommand());
        interpreter._list = null;
        assert.match(review(f), expected);
        sprite.worldAlpha = 0;
        assert.doesNotMatch(review(f), expected);
        sprite.worldAlpha = 1;
        patrol.processRouteEnd();
        assert.doesNotMatch(review(f), expected);
    }
}

async function verifyAutomaticClose() {
    const map = mapData(58);
    const f = await enter(map, 58);
    const event = map.events[36].pages[0].list;
    const first = event.findIndex((command, index) => command.code === 101 && event[index + 1]?.parameters[0]?.endsWith?.('\\^'));
    assert(first >= 0);
    Object.assign(f.settings, authoredPage(event, first), { faceReady: true });
    f.until(() => f.packets().length === 1);
    assert.equal(f.window.isClosing(), true);
    assert.equal(f.window.openness, 255);
    assert.equal(f.window.pause, false);
    assert.equal(f.settings.text, '');
    assert.equal(f.packets()[0].text.trim(), f.shown.join('').trim());
    f.dispatchWindowEvent('keydown', { key: 'r', keyCode: 82 });
    assert.equal(formatSpeech(f.packets()[1]), formatSpeech(f.packets()[0]));
    for (let frame = 0; frame < 10; frame++) f.tick();
    assert.equal(f.window.openness, 0);
    f.dispatchWindowEvent('keydown', { key: 'r', keyCode: 82 });
    assert.equal(f.packets().length, 2, 'an automatic page speaks once on its own and can only be repeated while visible');

    for (const retire of ['advance opacity', 'native transfer']) {
        const pending = await enter(map, 58);
        Object.assign(pending.settings, authoredPage(event, first), { faceReady: true });
        pending.until(() => !!pending.window._wqaAutoPaint, false);
        assert.deepEqual(pending.packets(), []);
        if (retire === 'advance opacity') pending.tick(false);
        else pending.c.$gamePlayer.reserveTransfer(19, 8, 8, 2, 0);
        pending.frame();
        assert.deepEqual(pending.packets(), [], 'an auto-closing page needs a full rendered frame before retirement');
        assert.equal(pending.epoch(), 0);
    }
}

async function verifyBattleDialogue() {
    const troops = JSON.parse(fs.readFileSync(path.join(process.argv[2], 'package.nw', 'data', 'Troops.json'), 'utf8'));
    const pages = troops.filter(Boolean).flatMap(troop => troop.pages);
    const normal = pages.map(page => page.list).find(list => list.some((command, index) =>
        command.code === 101 && list[index + 1]?.code === 401 && !list[index + 1].parameters[0].includes('\\^')));
    assert(normal);
    const f = await enter(mapData(19), 19, true);
    assert.equal(f.scene._wqaBattleStarted, true);
    Object.assign(f.settings, authoredPage(normal), { faceReady: true });
    f.until(() => f.window.pause);
    f.speaker._animationRunning = false;
    assert.deepEqual(f.packets(), [], 'battle fade prevents dialogue admission');
    f.scene._fadeDuration = f.scene._fadeOpacity = 0;
    f.tick();
    assert.deepEqual(f.packets(), [], 'battle dialogue needs a native message wait owner');
    f.settings.interpreter = new f.c.Game_Interpreter();
    f.settings.interpreter._list = normal;
    f.settings.interpreter.setWaitMode('message');
    f.settings.battleBusy = true;
    f.tick();
    assert.deepEqual(f.packets(), [], 'the current native busy result still blocks speech');
    f.settings.battleBusy = false;
    f.tick(false);
    assert.deepEqual(f.packets(), []);
    f.frame();
    assert.equal(f.packets()[0].kind, 'dialoguePage');
    assert.equal(f.packets()[0].text.replace(/\s+/g, ''), f.shown.join('').replace(/\s+/g, ''));
    f.advance();
    f.tick();
    assert.equal(f.epoch(), 0);
    assert.equal(f.scene._wqaBattleInterpreter, null);

    const auto = await enter(mapData(19), 19, true);
    auto.scene._fadeDuration = auto.scene._fadeOpacity = 0;
    const timed = troops[96].pages[5].list;
    const first = timed.findIndex((command, index) => command.code === 101 && timed[index + 1]?.parameters[0]?.endsWith?.('\\^'));
    assert(first >= 0);
    Object.assign(auto.settings, authoredPage(timed, first), { faceReady: true });
    auto.settings.interpreter = new auto.c.Game_Interpreter();
    auto.settings.interpreter._list = timed;
    auto.settings.interpreter.setWaitMode('message');
    auto.until(() => auto.packets().length === 1);
    assert(auto.epoch());
    auto.tick();
    assert.equal(auto.epoch(), 0, 'native battle phase work retires automatic dialogue first');
}

async function verifyRepeat() {
    const f = await enter(mapData(19));
    const { c, window, speaker, settings, choice } = f;
    c.a14_0x1f92c6 = () => { throw Error('Unresolved input property'); };
    c.Input._currentState = {};
    c.Input._shouldPreventDefault = () => false;
    c.Input.deviceType = { KEYBOARD: 'keyboard' };
    c.Input.SetLastInputDeviceType = () => {};
    const keydown = (overrides = {}) => {
        const event = { key: 'r', keyCode: 82, ...overrides };
        c.Input._onKeyDown(event);
        f.dispatchWindowEvent('keydown', event);
    };

    assert.equal(c.Input.keyMapper[82], undefined);
    Object.assign(settings, { text: 'A clue.\\! A second line.', speaker: 'Speaker',
        faceReady: true, choices: ['First answer', 'Second answer'] });
    f.until(() => window.pause);
    speaker._animationRunning = false;
    f.tick(false);
    keydown();
    assert.deepEqual(f.packets(), [], 'a drawn but unpresented page is ineligible');
    f.frame();
    assert.equal(formatSpeech(f.packets()[0]), 'Speaker. A clue.');
    for (const override of [{ ctrlKey: true }, { altKey: true }, { shiftKey: true }, { metaKey: true },
        { repeat: true }, { isComposing: true }, { defaultPrevented: true }, { key: 't' },
        { target: { closest: () => ({}) } }]) keydown(override);
    c.$gameScreen._fadeOutDuration = 1;
    keydown();
    c.$gameScreen._fadeOutDuration = 0;
    c.document.hasFocus = () => false;
    keydown();
    c.document.hasFocus = () => true;
    c.Input.keyMapper[82] = 'fixtureNative';
    keydown();
    assert.equal(c.Input._currentState.fixtureNative, true);
    delete c.Input.keyMapper[82];
    assert.equal(f.packets().length, 1);
    keydown({ key: 'R' });
    assert.equal(formatSpeech(f.packets()[1]), 'Speaker. A clue.');
    assert.equal(window.pause, true);
    f.advance();
    keydown();
    assert.equal(f.packets().length, 2, 'an accepted advance retires the old presentation');
    f.until(() => f.packets().length === 4);
    assert.equal(formatSpeech(f.packets()[2]), 'A second line.');
    assert.equal(formatSpeech(f.packets()[3]), 'Choices. First answer');
    choice.select(1);
    f.tick();
    assert.equal(formatSpeech(f.packets()[4]), 'Second answer');
    keydown();
    assert.equal(formatSpeech(f.packets()[5]), 'Speaker. A clue. A second line.');
    assert.equal(choice.index(), 1);
    choice.callOkHandler();
    keydown();
    assert.equal(f.packets().length, 6);

    const equal = await enter(mapData(19));
    for (let index = 0; index < 2; index++) {
        Object.assign(equal.settings, { text: 'Same words', faceReady: true });
        equal.until(() => equal.packets().length === index * 2 + 1);
        equal.dispatchWindowEvent('keydown', { key: 'r', keyCode: 82 });
        assert.equal(formatSpeech(equal.packets().at(-1)), 'Same words');
        assert.equal(equal.packets().length, (index + 1) * 2);
        if (index === 1) {
            equal.c.document.hasFocus = () => false;
            equal.dispatchWindowEvent('blur');
        } else equal.advance();
        equal.dispatchWindowEvent('keydown', { key: 'r', keyCode: 82 });
        assert.equal(equal.packets().length, (index + 1) * 2);
    }
    assert.notEqual(equal.packets()[0].epoch, equal.packets()[2].epoch);
    assert.equal(equal.epoch(), 0);
    equal.c.document.hasFocus = () => true;
    equal.dispatchWindowEvent('keydown', { key: 'r', keyCode: 82 });
    assert.equal(formatSpeech(equal.packets()[4]), 'Same words');
    assert.notEqual(equal.packets()[4].epoch, equal.packets()[2].epoch);
    equal.c.document.hasFocus = () => false;
    equal.dispatchWindowEvent('blur');
    equal.advance();
    equal.c.document.hasFocus = () => true;
    equal.dispatchWindowEvent('keydown', { key: 'r', keyCode: 82 });
    assert.equal(equal.packets().length, 5, 'focus return does not revive a page retired in the background');
}

async function main() {
    assert.equal(formatSpeech({ kind: 'dialoguePage', text: '\x010\x02' }), '');
    const map = mapData(19);
    const f = await enter(map);
    const { settings, speaker, window, choice } = f;
    settings.text = 'Before \\V[7] \\I[96]\\!After';
    settings.speaker = '<c1><s0>Fixture speaker';
    f.tick();
    assert(f.window._faceBitmap);
    assert.deepEqual(f.packets(), []);
    settings.faceReady = true;
    f.until(() => window.pause);
    assert(f.shown.join('').includes('Before 23'));
    assert.deepEqual(f.iconDraws, [96]);
    assert.deepEqual(f.packets(), [], 'speaker must finish its native name animation');
    speaker._animationRunning = false;
    f.tick(false);
    assert.deepEqual(f.packets(), []);
    f.frame();
    assert.equal(formatSpeech(f.packets()[0]), 'Fixture speaker. Before 23 crossed spatulas');
    f.advance();
    assert.equal(f.epoch(), 0);
    f.until(() => f.packets().length === 2);
    assert.equal(formatSpeech(f.packets()[1]), 'After');
    f.advance();

    settings.text = 'Native prompt';
    settings.speaker = '';
    settings.choices = ['First \\V[7]', 'Second \\I[130]'];
    f.until(() => f.packets().length === 4);
    assert.equal(formatSpeech(f.packets()[2]), 'Native prompt');
    assert.equal(formatSpeech(f.packets()[3]), 'Choices. First 23');
    assert.equal(f.packets()[3].append, true);
    choice.select(1);
    f.tick();
    assert.equal(formatSpeech(f.packets()[4]), 'Second gloves');
    assert.equal(f.packets()[4].append, false);
    choice.callOkHandler();
    assert.equal(f.epoch(), 0);
    assert.equal(settings.result, 1);

    for (const expected of [6, 7]) {
        settings.text = 'After';
        f.until(() => f.packets().length === expected);
        assert.equal(formatSpeech(f.packets().at(-1)), 'After');
        f.advance();
    }

    const clue = await enter(map);
    Object.assign(clue.settings, authoredPage(map.events[114].pages[0].list), { faceReady: true });
    clue.until(() => clue.window.pause);
    clue.speaker._animationRunning = false;
    clue.tick();
    assert.equal(clue.packets()[0].kind, 'dialoguePage');
    assert.equal(clue.packets()[0].text.trim(), clue.shown.join('').trim());

    const introMap = mapData(38);
    const intro = await enter(introMap, 38);
    intro.c.$gameScreen._brightness = 0; // The map is black while its message window remains visible.
    Object.assign(intro.settings, authoredPage(introMap.events[1].pages[1].list), { faceReady: true });
    assert(intro.settings.choices.length > 0);
    intro.until(() => intro.choice.active);
    intro.speaker._animationRunning = false;
    intro.tick();
    assert.deepEqual(intro.packets().map(packet => packet.kind), ['dialoguePage', 'dialogueChoice']);
    assert.equal(intro.packets()[1].append, true);
    intro.choice.callCancelHandler();
    assert.equal(intro.epoch(), 0);
    assert.equal(intro.settings.result, -2);
    await verifyNumberEntry();
    await verifySaltGuide();
    await verifyCaveGuide();
    await verifyChamberChestHint();
    await verifyMapDiagrams();
    await verifyCredits();
    console.log('Verified native picture waits, cavern trails, atlas markers, ending cards and current-picture review.');
    await verifyAutomaticClose();
    await verifyBattleDialogue();

    await verifyRepeat();
    console.log('Verified installed dialogue, the chamber chest hint, Salt Caverns guidance, cave patrols and four recovery branches.');
}

if (require.main === module)
    main().catch(error => { console.error(error); process.exitCode = 1; });

module.exports = { enter };
