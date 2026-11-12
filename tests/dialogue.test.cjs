'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, mapData } = require('./map-lifecycle.test.cjs');
const { formatSpeech } = require('../src/services/speech-text.cjs');

const methods = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning',
    path.join(__dirname, 'dialogue-producers.py'), process.argv[2]], { encoding: 'utf8', timeout: 6000, maxBuffer: 64000 }));

async function enter(map, mapId = 19, battle = false) {
    const f = fixture(map);
    const { c } = f;
    c.a2_0x990531 = () => { throw Error('Unresolved battle property'); };
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
            _spriteset: { isBusy: () => settings.battleBusy }, _logWindow: { isBusy: () => false },
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
    return { ...f, scene, window, choice, number, settings, speaker, shown, iconDraws, tick, until, advance, pressDigit, packets };
}

function authoredPage(commands, first = commands.findIndex(command => command.code === 101)) {
    assert(first >= 0);
    let end = first + 1;
    while (commands[end]?.code === 401) end++;
    return { text: commands.slice(first + 1, end).map(command => command.parameters[0]).join('\n'),
        speaker: commands[first].parameters[4] || '', choices: commands[end]?.code === 102 ? commands[end].parameters[0] : [] };
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
    for (let frame = 0; frame < 10; frame++) f.tick();
    assert.equal(f.window.openness, 0);
    assert.equal(f.packets().length, 1, 'the confirmed automatic page remains a single speech event');

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
    await verifyAutomaticClose();
    await verifyBattleDialogue();
    console.log('Verified installed map and battle dialogue, puzzle clue, choices, number entry, and automatic-close text.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
