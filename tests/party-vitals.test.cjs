'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { partyVitals, portraitActor, menuVitals, fieldVitals, fieldVitalsVisible } = require('../src/battle/party-vitals');
const { nativeTextHost } = require('./native-text-host.cjs');
const { formatSpeech } = require('../src/services/speech-text.cjs');
const { normalizeKeys } = require('../src/settings/keyboard');
const { normalizeController } = require('../src/settings/controller-bindings');

const installed = process.argv[2];
const methods = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning',
    path.join(__dirname, 'battle-focus-producers.py'), installed, 'vitals'],
{ encoding: 'utf8', timeout: 7000, maxBuffer: 64 * 1024 }));
const actors = JSON.parse(fs.readFileSync(path.join(installed, 'package.nw/data/Actors.json'), 'utf8'));
const states = JSON.parse(fs.readFileSync(path.join(installed, 'package.nw/data/States.json'), 'utf8'));
const actualState = states.find(state => state?.iconIndex > 0 && state.name);
const scene = {};
const ready = { isReady: () => true };

const host = nativeTextHost();
const { Sprite, Sprite_Text: SpriteText } = host;
Object.assign(SpriteText.prototype, {
    setAlignment() { return this; }, setShadowEnabled() { return this; }, setShadowDraw() { return this; }
});
function RadialStatus() { Sprite.call(this, ready); }
RadialStatus.prototype = Object.create(Sprite.prototype);
Object.assign(RadialStatus.prototype, {
    RequestUIUpdate() {}, UpdateFill() {}, UpdateMask() {},
    InitMomentum(max) {
        this.momentumPips = Array.from({ length: max }, (_, index) => {
            const baseSprite = new Sprite(ready);
            baseSprite.setFrame(index < this._momentumCurrent ? 32 : 0, 0, 32, 32);
            this.addChild(baseSprite);
            return { baseSprite };
        });
    }
});
host.Bitmap.load = () => ready;
const c = vm.createContext({ ...host, RadialStatus, ImageManager: { iconWidth: 32, iconHeight: 32 },
    Scene_Map: function () {}, Scene_Menu: function () {}, Scene_Item: function () {}, SceneManager: {},
    Graphics: { boxWidth: 640, boxXOffset: 0, boxYOffset: 0 }, $gameParty: { battleMembers: () => [actor] },
    PIXI: { LINE_CAP: { ROUND: 'round' }, LINE_JOIN: { BEVEL: 'bevel' } },
    Lerp: (from, to, fraction) => from + (to - from) * fraction,
    a23_0x243974() { throw Error('Unresolved native HUD property'); },
    a16_0x55d438() { throw Error('Unresolved native menu property'); },
    a15_0x363c12() { throw Error('Unresolved native map HUD property'); } });
for (const method of methods) vm.runInContext(method, c, { timeout: 100 });

const hud = scene._statusWindow = Object.assign(new RadialStatus(), { parent: scene, y: 0, offsetY: 0,
    states: [], stateIcons: {}, iconBitmap: ready, iconBaseX: -128, iconBaseY: 120, iconYStep: 2 });
for (const [field, value] of Object.entries({ _numberSprite: '0', _totalSprite: '0', _dividerSprite: '/',
    _FPSprite: '0', _totalSpriteFP: '0', _dividerSpriteFP: '/', levelNumberSprite: '4' })) {
    hud[field] = new SpriteText().setText(value);
    hud.addChild(hud[field]);
}
for (const icon of ['_HPIcon', '_FPIcon']) {
    hud[icon] = new Sprite(ready);
    hud.addChild(hud[icon]);
}
const actor = { hp: 19, mhp: 24, mp: 3, mmp: 7, actor: () => actors[1], getMomentum: () => 1, getMomentumMax: () => 2 };
const main = { _actor: actor, _battlerName: actors[1].battlerName, _mainSprite: new Sprite(ready) };
main._mainSprite.parent = main;
const companion = new Sprite(ready);
Object.assign(companion, { parent: {}, _actor: actors[2], _battlerName: actors[2].battlerName, _mainSprite: companion,
    _FPIcon: new Sprite(ready) });
companion.addChild(companion._FPIcon);
companion._FPIcon.setFrame(32, 32, 32, 32);
scene._spriteset = { _actorSprites: [main], _subActorSprite: companion };
const graphics = { height: 360 };
const read = (sprite, hpOnly) => formatSpeech(partyVitals(scene, graphics, sprite, hpOnly) || {});

hud.SetBattler(actor);
hud.AddState(actualState);
hud.UpdateStateIconPositions();
hud.update();
assert.equal(portraitActor(scene, main).name, actors[1].name);
assert.equal(portraitActor(scene, companion).name, actors[2].name);
const start = performance.now();
assert.equal(read(main), [actors[1].name, 'HP 19 of 24', 'FP 3 of 7', 'Level 4', 'Momentum 1 of 2',
    'Status, ' + actualState.name].join('. '));
const measured = performance.now() - start;
assert.equal(read(main, true), actors[1].name + '. HP 19 of 24');
assert.equal(read(companion), actors[2].name + '. Shared FP 3 of 7. Companion skills unavailable');
hud._totalSprite.worldVisible = false;
hud._FPSprite.setText('6');
assert.equal(read(main, true), actors[1].name + '. HP 19');
assert.doesNotMatch(read(main), /FP 6|HP 19 of 24/);
hud.update();
assert.match(read(main), /FP 6 of 7/);
hud.stateIcons[actualState.id].y = 370;
assert.doesNotMatch(read(main), /Status,/);
hud.RemoveState(actualState.id);
hud.offsetY = -200;
assert.equal(read(main), '');
assert.equal(read(companion), actors[2].name + '. Companion skills unavailable');
companion.bitmap = null;
assert.equal(read(companion), '');

Sprite.prototype.show = function () { this.worldVisible = true; };
Sprite.prototype.hide = function () { this.worldVisible = false; };
c.RadialStatus = function () {
    const next = new RadialStatus();
    Object.assign(next, { offsetY: 0, states: [], stateIcons: {}, iconBitmap: ready, iconBaseX: -128,
        iconBaseY: 120, iconYStep: 2, currentXPFill: 0.61, currentHPFill: 19 / 24, currentFPFill: 3 / 7,
        fillMaskX: -47, fillMaskY: 47, fillHPAngleStart: 0.43 * Math.PI, fillHPAngleEnd: 1.21 * Math.PI,
        fillFPAngleStart: 0.43 * Math.PI, fillFPAngleEnd: Math.PI });
    for (const [fillName, maskName] of [['fillSprite', 'fillMask'], ['fillFPSprite', 'fillFPMask']]) {
        const mask = next[maskName] = next.addChild(new Sprite());
        Object.assign(mask, { geometry: { graphicsData: [] }, lineStyle() {},
            clear() { this.geometry.graphicsData.length = 0; },
            arc(x, y, radius, start, end) {
                const points = [x + radius * Math.cos(start), y + radius * Math.sin(start)];
                const samples = 16;
                for (let sample = 1; sample <= samples; sample++) {
                    const angle = start + (end - start) * sample / samples;
                    points.push(x + radius * Math.cos(angle), y + radius * Math.sin(angle));
                }
                this.geometry.graphicsData.push({ shape: { points } });
            }
        });
        next[fillName] = next.addChild(new Sprite(ready));
        next[fillName].mask = mask;
    }
    next.backingFP = next.addChild(new Sprite(ready));
    for (const field of ['_numberSprite', '_totalSprite', '_dividerSprite', '_FPSprite', '_totalSpriteFP',
        '_dividerSpriteFP', 'levelNumberSprite'])
        next[field] = next.addChild(new SpriteText().setText(field.includes('divider') ? '/' : '4'));
    for (const field of ['_HPIcon', '_FPIcon', 'backSprite', 'levelMetreSprite', 'levelMetreFillSprite'])
        next[field] = next.addChild(new Sprite(ready));
    const mask = next.fillXPMask = next.addChild(new Sprite());
    Object.assign(mask, { geometry: { graphicsData: [] }, beginFill() {}, endFill() {},
        clear() { this.geometry.graphicsData.length = 0; },
        drawRect(x, y, width, height) { this.geometry.graphicsData.push({ shape: { x, y, width, height } }); }
    });
    next.levelMetreFillSprite.mask = mask;
    next.UpdateMask = next.fixtureUpdateMask;
    next.InitScene();
    return next;
};
let menuRead = 0;
for (const kind of [c.Scene_Menu, c.Scene_Item, c.Scene_Map]) {
    Object.setPrototypeOf(kind.prototype, Sprite.prototype);
    const menu = c.SceneManager._scene = Object.assign(new kind(), { children: [] });
    menu.createStatusWindow();
    const status = menu._statusWindow;
    assert.equal(status.battler, actor);
    const inMap = kind === c.Scene_Map;
    const read = inMap ? fieldVitals : menuVitals;
    if (inMap) {
        assert(fieldVitalsVisible(menu));
        assert.equal(status._HPIcon.worldVisible, false);
        assert.equal(status._FPIcon.worldVisible, false);
    } else assert.equal(menu._wqaMenuStatus, status);
    status.update();
    const start = performance.now();
    const hp = inMap ? 'HP bar 79 percent' : 'HP 19 of 24';
    const fp = inMap ? 'FP bar 43 percent' : 'FP 3 of 7';
    assert.equal(formatSpeech(read(menu, graphics)),
        [actors[1].name, hp, fp, 'Level 4, experience bar 59 percent', 'Momentum 1 of 2'].join('. '));
    menuRead += performance.now() - start;
    status.currentXPFill = 1;
    assert.match(formatSpeech(read(menu, graphics)), /59 percent/, 'the unpainted value cannot change speech');
    status.UpdateMask();
    assert.match(formatSpeech(read(menu, graphics)), /experience bar full/);
    status.currentXPFill = 0;
    status.UpdateMask();
    assert.match(formatSpeech(read(menu, graphics)), /experience bar empty/);
    status.levelMetreFillSprite.worldVisible = false;
    assert.doesNotMatch(formatSpeech(read(menu, graphics)), /experience bar/);
    assert.equal(formatSpeech(read(menu, graphics, true)), actors[1].name + '. ' + hp);
    if (inMap) {
        status.currentHPFill = 1;
        assert.match(formatSpeech(read(menu, graphics, true)), /79 percent/);
        status.UpdateMask();
        assert.match(formatSpeech(read(menu, graphics, true)), /100 percent/);
        status.currentHPFill = 0;
        status.UpdateMask();
        assert.match(formatSpeech(read(menu, graphics, true)), /0 percent/);
        status.backingFP.worldVisible = false;
        assert.doesNotMatch(formatSpeech(read(menu, graphics)), /FP/);
    }
    status.offsetY = -4;
    assert.equal(read(menu, graphics), null);
}

const keys = normalizeKeys({ details: 'H', battleSlot1: '7' });
assert.equal(keys.details, 'H');
assert.equal(keys.battleHP, null);
assert.equal(keys.battleSlot1, '7');
assert.equal(keys.battleSlot2, '2');
assert.equal(normalizeController({}).battleVitals, 2);
assert.equal(normalizeController({ details: 2 }).battleVitals, null);
assert.equal(normalizeController({ battleVitals: 4 }).battleVitals, 4);
console.log('Verified installed radial HUD paint, party identity, states, momentum and hidden values.');
console.log('Throttled rendered vitals read and formatted receipt', measured.toFixed(2), 'ms.');
console.log('Verified installed map, pause and Inventory HUD ownership and painted experience geometry.');
console.log('Throttled three map and menu vitals reads through formatted receipt', menuRead.toFixed(2), 'ms.');