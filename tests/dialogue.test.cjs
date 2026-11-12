'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { fixture, mapData } = require('./map-lifecycle.test.cjs');
const { formatSpeech } = require('../src/services/speech-text.cjs');

const methods = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning',
    path.join(__dirname, 'dialogue-producers.py'), process.argv[2]], { encoding: 'utf8', timeout: 6000, maxBuffer: 64000 }));

async function enter(map, mapId = 19) {
    const f = fixture(map);
    const { c } = f;
    c.Window_Message = function () {};
    c.Window_Selectable = function () {};
    c.Window_ChoiceList = function () {};
    Object.setPrototypeOf(c.Window_Message.prototype, c.Window_Base.prototype);
    Object.setPrototypeOf(c.Window_Selectable.prototype, c.Window_Base.prototype);
    Object.setPrototypeOf(c.Window_ChoiceList.prototype, c.Window_Selectable.prototype);
    for (const method of methods) f.run(method);

    const shown = [];
    const iconDraws = [];
    let triggered = false;
    const settings = {
        text: '', speaker: '', choices: [], result: null, faceReady: false,
        allText() { return this.text; }, speakerName() { return this.speaker; },
        faceName: () => 'Synthetic face', isBusy() { return !!this.text || this.choices.length > 0; },
        hasText() { return !!this.text; }, scrollMode: () => false, isChoice() { return this.choices.length > 0; },
        isNumberInput: () => false, isItemChoice: () => false, choiceDefaultType: () => 0,
        choiceCancelType: () => -2, onChoice(index) { assert.equal(f.epoch(), 0); this.result = index; },
        clear() { this.text = ''; this.choices = []; }
    };
    // Stock accessors return the native data. Keep the fixture's editable copy
    // separate from the accessor so choices are handled by the real command builder.
    c.$gameMessage = Object.create(settings);
    c.$gameMessage.choices = () => settings.choices;
    c.$gameMessage.isBusy = () => settings.isBusy();
    c.$gameMessage.isChoice = () => settings.isChoice();
    c.$gameMessage.clear = () => settings.clear();
    c.$gameMessage.onChoice = index => settings.onChoice(index);
    c.$gameVariables = { value: id => id === 7 ? 23 : 0 };
    c.Utils.containsArabic = () => false;
    c.ImageManager.faceWidth = 144;
    c.ImageManager.iconWidth = c.ImageManager.iconHeight = 36;
    c.ImageManager.loadSystem = () => ({});
    c.Input.update = () => assert.equal(f.epoch(), 0);
    c.SceneManager.isNextScene = () => false;
    c.Scene_Battle = function () {};
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
        _nameSprite: speaker, _goldWindow: { close() {} }, _numberInputWindow: {}, _eventItemWindow: {},
        contents, contentsOpacity: 255, worldVisible: true, worldAlpha: 1, openness: 0,
        _waitCount: 0, checkToNotClose() {}, synchronizeNameBox() {}, isOpening: () => false, isClosing: () => false,
        updatePlacement() {}, updateBackground() {}, updateBackgroundType() {}, drawMessageFace() {},
        loadMessageFace() { this._faceBitmap = { isReady: () => settings.faceReady }; },
        open() { this.openness = 255; }, close() { this.openness = 0; },
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
    window._choiceListWindow = choice;
    c.Scene_Message.prototype.update = function () { window.update(); };
    c.$gameMap._nameDisplay = false;
    c.$gamePlayer.reserveTransfer(mapId, 8, 8, 2, 0);
    c.SceneManager.goto(c.Scene_Map);
    c.SceneManager.changeScene();
    c.DataManager.ready = c.ImageManager.ready = true;
    c.SceneManager.updateScene();
    await new Promise(setImmediate);
    const scene = c.Graphics.app.stage;
    scene._messageWindow = window;
    window.parent = choice.parent = scene._windowLayer;
    scene._fadeDuration = scene._fadeOpacity = 0;
    c.SceneManager.updateScene();
    f.idleCallbacks.shift()();

    function tick(render = true) {
        c.SceneManager.updateScene();
        if (render) f.frame();
    }
    function until(predicate) {
        for (let frame = 0; frame < 500; frame++) {
            if (predicate()) return;
            tick();
        }
        assert.fail('Native message did not reach the expected boundary');
    }
    function advance() {
        window._waitCount = 0;
        triggered = true;
        tick();
        triggered = false;
    }
    const packets = () => f.packets.filter(packet => packet.kind === 'dialoguePage' || packet.kind === 'dialogueChoice');
    return { ...f, window, choice, settings, speaker, shown, iconDraws, tick, until, advance, packets };
}

function authoredPage(commands) {
    const first = commands.findIndex(command => command.code === 101);
    assert(first >= 0);
    let end = first + 1;
    while (commands[end]?.code === 401) end++;
    return { text: commands.slice(first + 1, end).map(command => command.parameters[0]).join('\n'),
        speaker: commands[first].parameters[4] || '', choices: commands[end]?.code === 102 ? commands[end].parameters[0] : [] };
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
    console.log('Verified installed dialogue paint, speaker visibility, puzzle clue, opening choices, native acceptance, and cancellation.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
