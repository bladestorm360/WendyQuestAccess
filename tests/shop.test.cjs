'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { createMenuObserver } = require('../src/menus/observer');
const { formatSpeech } = require('../src/services/speech-text.cjs');

const installed = process.argv[2];
const data = file => JSON.parse(fs.readFileSync(path.join(installed, 'package.nw', 'data', file + '.json'), 'utf8'));
const armor = data('Armors').find(item => item?.name && item.description && item.etypeId > 0 && item.params[3] > 0);
const item = data('Items').find(item => item?.name && item.description && item.occasion === 0);
const system = data('System');
const renderer = new EventEmitter();
const speech = [];
let active = 0;
let epoch = 0;
let offers = 0;
let buys = 0;
let money = 27;
let stock = 2;
const c = vm.createContext({
    Scene_Base: function () {}, Scene_MenuBase: function () {}, Scene_Shop: function () {},
    Window_ShopBuy: function () {}, Window_ShopStatus: function () {}, Window_Shop_Help: function () {},
    Window_Gold: function () {}, Window_ShopNumber: function () {}, Window_Selectable: function () {},
    SceneManager: {}, Graphics: { app: { renderer } },
    Scene_Shop_prototype_create() { assert(this._wqaShop); },
    TextManager: { possession: system.terms.commands[17], param: id => system.terms.params[id] },
    $gameParty: { hasMaxItems: () => false, numItems: () => stock, maxItems: () => 99,
        loseGold(amount) { assert.equal(active, 0); money -= amount; },
        gainItem(item, amount) { assert.equal(item, armor); stock += amount; buys++; } },
    SoundManager: { playCancel() { assert.equal(active, 0); }, playShop() { assert.equal(active, 0); } },
    DataManager: { isWeapon: () => false }, ColorManager: { systemColor: () => '', paramchangeTextColor: () => '' },
    a16_0x55d438() { throw Error('Unresolved shop property'); }
});
c.Scene_Base.prototype.update = () => {};
c.Window_Selectable.prototype.refresh = function () { this.contents.clear(); };
Object.setPrototypeOf(c.Scene_Shop.prototype, c.Scene_MenuBase.prototype);
c.Scene_Shop.prototype.updatePageButtons = () => {};
c.Scene_Shop.prototype.commandBuy = function () { this._buyWindow.active = true; };
const methods = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning', path.join(__dirname, 'shop-producers.py'),
    installed], { encoding: 'utf8', timeout: 6000, maxBuffer: 48 * 1024 }));
for (const method of methods) vm.runInContext(method, c, { timeout: 100 });

const layer = {};
const scene = c.SceneManager._scene = c.Graphics.app.stage = Object.assign(new c.Scene_Shop(), {
    _active: true, _started: true, _fadeDuration: 0, _fadeOpacity: 0, _windowLayer: layer
});
const painted = [];
function windowFor(Constructor, fields) {
    const box = { x: 0, y: 0, width: 240, height: 30 };
    return Object.assign(new Constructor(), { parent: layer, worldVisible: true, worldAlpha: 1, openness: 255,
        contentsOpacity: 255, innerWidth: 280, innerHeight: 140, contents: { isReady: () => true, clear() {} },
        itemPadding: () => 4, textWidth: text => text.length * 6, itemRect: () => box, itemLineRect: () => box,
        changePaintOpacity() {}, changeTextColor() {}, resetTextColor() {}, lineHeight: () => 28,
        drawText(value) { painted.push(value); }, drawItemName(value) { painted.push(value?.name); } }, fields);
}
const buy = scene._buyWindow = windowFor(c.Window_ShopBuy, {
    _data: [item, armor], _price: [12, 36], _money: money, _index: 0, priceWidth: () => 80,
    maxItems() { return this._data.length; }, itemAt(index) { return this._data[index]; },
    item() { return this.itemAt(this._index); },
    hide() { assert.equal(active, 0); this.worldVisible = this.active = false; }
});
const gold = scene._goldWindow = windowFor(c.Window_Gold, { value: () => money, currencyUnit: () => system.currencyUnit,
    drawCurrencyValue(value, unit) { painted.push(value, unit); } });
const help = scene._helpWindow = windowFor(c.Window_Shop_Help, { baseTextRect: buy.itemLineRect });
const equipped = { name: 'Fixture equipment', params: [0, 0, 0, 1] };
const actor = { name: () => 'Fixture shopper', canEquip: () => true, isEquipped: value => value === armor };
const status = scene._statusWindow = windowFor(c.Window_ShopStatus, { statusMembers: () => [actor],
    currentEquippedItem: () => equipped });
scene.buyingPrice = () => buy.price(buy.item());
scene.currencyUnit = gold.currencyUnit;
scene.money = gold.value;
scene._commandWindow = { currentSymbol: () => 'buy' };
const quantity = scene._numberWindow = windowFor(c.Window_ShopNumber, {
    _index: -1, active: false, worldVisible: false, cursorX: () => 84, itemNameY: () => 20,
    totalPriceY: () => 48, cursorWidth: () => 52,
    drawCurrentItemName() { this.drawItemName(this._item); }, drawMultiplicationSign() {}, drawHorzLine() {},
    drawCurrencyValue: gold.drawCurrencyValue, UpdateButtonEnabled() {}, placeButtons() {}, playCursorSound() {},
    show() { this.worldVisible = true; }, activate() { this.active = true; },
    hide() { this.worldVisible = this.active = false; }
});
const observer = createMenuObserver(c, { manager: c.SceneManager, graphics: c.Graphics, hasFocus: () => true }, {
    open(record, live) { assert(live()); speech.push(formatSpeech(record)); return active = ++epoch; },
    focus(token, record) { assert.equal(token, active); speech.push(formatSpeech(record)); },
    close(token) { if (token === active) active = 0; }
}, () => ({ indexing: true, autodetail: true }));
c.WendyQuestAccessMenuReady = (scene, screen) => { offers++; observer.observe(scene, screen); };
c.WendyQuestAccessMenuLeaving = observer.retire;
const unit = system.currencyUnit.trim();

function paintSelection() {
    const selected = buy.item();
    buy.drawItem(buy._index);
    help._text = selected.description;
    help.refresh();
    status._item = selected;
    status.drawPossession(0, 0);
    if (selected.etypeId) status.drawActorEquipInfo(0, 28, actor);
}
status.refresh = paintSelection;
scene.activateBuyWindow = () => {
    buy._money = money;
    buy.worldVisible = buy.active = true;
    paintSelection();
};
function frame() { scene.update(); renderer.emit('postrender'); }

scene.create();
gold.refresh();
paintSelection();
scene._fadeDuration = 2;
frame();
assert.equal(offers, 0);
scene._fadeDuration = 0;
const start = performance.now();
scene.update();
assert.deepEqual(speech, []);
renderer.emit('postrender');
const receipt = performance.now() - start;
assert.equal(speech[0], 'Shop, ' + item.name + ', Price 12 ' + unit + ', 1 of 2');
assert(speech[1].includes('Owned 2') && speech[1].includes('Balance 27 ' + unit));

buy._index = 1;
paintSelection();
frame();
assert.equal(speech[2], armor.name + ', Price 36 ' + unit + ', unavailable, 2 of 2');
assert(speech[3].includes('Owned 3') && speech[3].includes(equipped.name));
assert(speech[3].includes(system.terms.params[3] + ' ' + (armor.params[3] - 1 > 0 ? '+' : '') + (armor.params[3] - 1)));
assert(painted.includes(36));

money = 72;
stock = 7;
buy._money = money;
assert(observer.controlOwner(scene), 'unpainted balance or inventory changes do not replace the visible page');
gold.refresh();
paintSelection();
frame();
assert.equal(speech[4], armor.name + ', Price 36 ' + unit + ', 2 of 2');
assert(speech[5].includes('Owned 8') && speech[5].includes('Balance 72 ' + unit));

function measure(update) {
    const started = performance.now();
    for (let index = 0; index < 300; index++) { update.call(scene); renderer.emit('postrender'); }
    return performance.now() - started;
}
const baseline = measure(scene.fixtureNativeUpdate);
const enabled = measure(scene.update);
assert.equal(speech.length, 6);
scene.onBuyOk();
assert.equal(observer.controlOwner(scene), null);
assert.equal(quantity._item, armor);
assert.equal(quantity._max, 2);
assert.equal(quantity._number, 1);
frame();
assert.equal(speech[6], 'Purchase quantity, ' + armor.name + ', quantity 1, Total 36 ' + unit);
const quantityStart = performance.now();
quantity.changeNumber(1);
frame();
const quantityReceipt = performance.now() - quantityStart;
assert.equal(speech[8], armor.name + ', quantity 2, Total 72 ' + unit);
assert(observer.command(observer.controlOwner(scene), 'details'));
assert(speech.at(-1).startsWith('Quantity 2, total 72 ' + unit));
const beforeCap = speech.length;
quantity.changeNumber(9);
frame();
assert.equal(speech.length, beforeCap, 'the native cap leaves the same paint current');
scene.onNumberCancel();
assert.equal(observer.controlOwner(scene), null);
frame();
assert.equal(speech[beforeCap], 'Shop, ' + armor.name + ', Price 36 ' + unit + ', 2 of 2');
assert.equal(buys, 0);
assert.equal(money, 72);

scene.onBuyOk();
quantity.changeNumber(1);
frame();
scene.onNumberOk();
assert.equal(observer.controlOwner(scene), null);
assert.equal(buys, 1);
assert.equal(money, 0);
assert.equal(stock, 9);
frame();
assert.equal(speech.at(-3), 'Shop, ' + armor.name + ', Price 36 ' + unit + ', unavailable, 2 of 2');
assert(speech.at(-2).includes('Owned 10') && speech.at(-2).includes('Balance 0 ' + unit));
assert.equal(speech.at(-1), 'Purchased 2, ' + armor.name + '.');
frame();
assert.equal(speech.filter(line => line.startsWith('Purchased ')).length, 1);
console.log('Verified native shop focus, price, availability, equipment comparison, quantity, cancel, purchase and displayed handback.');
console.log('Throttled shop focus through synthetic render and formatted receipt', receipt.toFixed(2), 'ms. 300 stable frames',
    baseline.toFixed(2), 'ms native,', enabled.toFixed(2), 'ms enabled.');
console.log('Throttled quantity change through synthetic render and formatted receipt', quantityReceipt.toFixed(2), 'ms.');
