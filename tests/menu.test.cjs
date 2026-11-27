'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { performance } = require('node:perf_hooks');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { createMenuObserver } = require('../src/menus/observer');
const { formatSpeech } = require('../src/services/speech-text.cjs');

const installed = process.argv[2];
const data = file => JSON.parse(fs.readFileSync(path.join(installed, 'package.nw', 'data', file + '.json'), 'utf8'));
const item = data('Items').find(row => row?.description.includes('\n'));
const armor = data('Armors').find(row => row?.description && row.etypeId > 0);
const terms = data('System').terms.params;
const renderer = new EventEmitter();
const records = [];
const trace = [];
let current = 0;
let sequence = 0;
let admitted;
const actor = { param: index => [12, 3, 5, 9][index], equipSlots: () => [armor.etypeId] };
const root = vm.createContext({
    Scene_Menu: function () {}, Scene_Item: function () {}, Window_Item_Help: function () {},
    Window_Gold: function () {}, SceneManager: {},
    Window_ItemList: function () {}, Window_ItemCategory: function () {}, Window_EquipStatus: function () {},
    Scene_Menu_prototype_update() {}, Scene_Item_prototype_update() {},
    Window_ItemList_prototype_updateHelp() {},
    Point: function () {},
    TouchInput: { isClicked: () => false },
    TextManager: { param: id => terms[id], item: data('System').terms.commands[4],
        armor: data('System').terms.commands[13], keyItem: data('System').terms.commands[14] },
    $dataSystem: data('System'),
    $gameParty: { numItems: () => 3, leader: () => actor },
    JsonEx: { makeDeepCopy: () => ({ ...actor, param: index => [12, 3, 7, 10][index],
        isEquipChangeOk: () => true, forceChangeEquip() {} }) },
    CoroutineManager: { StartAnonymousCoroutine() {} },
    a16_0x55d438() {}
});
const methods = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning',
    path.join(__dirname, 'menu-producers.py'), installed], { encoding: 'utf8', timeout: 6000, maxBuffer: 20000 }));
for (const method of methods) vm.runInContext(method, root, { timeout: 100 });

const host = { manager: root.SceneManager, graphics: { app: { renderer } }, hasFocus: () => true };
const preferences = { autodetail: false, indexing: false };
const menu = createMenuObserver(root, host, {
    open(record, ready) { assert(ready()); admitted = ready; records.push(record); return current = ++sequence; },
    focus(token, record) { assert.equal(token, current); records.push(record); },
    close(token) { if (token && token === current) { trace.push('closed'); current = 0; } }
}, () => preferences);
root.WendyQuestAccessMenuReady = (scene, kind) => menu.observe(scene, kind);
root.WendyQuestAccessMenuLeaving = scene => menu.retire(scene);

function stage(scene) {
    host.manager._scene = host.graphics.app.stage = scene;
    return Object.assign(scene, { _active: true, _started: true, _fadeDuration: 0, _fadeOpacity: 0, _windowLayer: {} });
}
function windowFor(scene, values = {}) {
    return { parent: scene._windowLayer, active: true, worldVisible: true, worldAlpha: 1, openness: 255,
        contentsOpacity: 255, contents: { isReady: () => true, clear() {} }, _index: 0,
        innerWidth: 100, innerHeight: 100, itemRect: () => ({ x: 0, y: 0, width: 90, height: 20 }), ...values };
}
function frame(scene) { scene.update(); renderer.emit('postrender'); }
const spoken = () => formatSpeech(records.at(-1));

const pause = stage(new root.Scene_Menu());
pause._commandWindow = windowFor(pause, { _list: [{ name: 'Save', enabled: false }, { name: '' }, { name: 'Items', enabled: true }] });
pause.executeAutosave = () => { trace.push('native save'); };
pause._fadeDuration = 1;
frame(pause);
assert.equal(records.length, 0);
pause._fadeDuration = 0;
pause.update();
assert.equal(records.length, 0, 'an active selection still requires a render');
renderer.emit('postrender');
assert.equal(spoken(), 'Menu, Save, unavailable');
const pausePage = menu.controlOwner(pause);
let goldValue = 17;
const gold = pause._goldWindow = Object.assign(new root.Window_Gold(), windowFor(pause), {
    itemLineRect: () => ({ x: 0, y: 0, width: 100 }), value: () => goldValue, currencyUnit: () => 'Gold',
    drawCurrencyValue(value, unit) { this.drawn = value + ' ' + unit; }
});
assert(!menu.command(pausePage, 'gold'), 'the window must have drawn the amount');
gold.refresh();
assert(menu.command(pausePage, 'gold'));
assert.equal(spoken(), gold.drawn);
assert.equal(spoken(), '17 Gold');
const previousGold = admitted;
goldValue = 19;
assert(previousGold(), 'unpainted amounts do not affect the current reading');
gold.refresh();
assert(!previousGold(), 'a redraw retires the older reading');
assert(menu.command(pausePage, 'gold'));
assert.equal(spoken(), '19 Gold');
gold.worldVisible = false;
assert(!admitted() && !menu.command(pausePage, 'gold'));
gold.worldVisible = true;
gold.contents = { isReady: () => true };
assert(!menu.command(pausePage, 'gold'), 'a replacement bitmap has no recorded paint');
pause._commandWindow._index = 2;
preferences.indexing = true;
frame(pause);
assert.equal(spoken(), 'Items, 2 of 2', 'indexing excludes native blank cells');
pause.commandSave();
assert.deepEqual(trace.slice(-2), ['closed', 'native save']);
assert.equal(menu.controlOwner(pause), null);

const inventory = stage(new root.Scene_Item());
inventory.updateMouseMoved = () => { inventory._mouseHasMoved = false; };
const help = inventory._helpWindow = Object.assign(new root.Window_Item_Help(), windowFor(inventory), {
    baseTextRect: () => ({ x: 0, y: 0, width: 90 }), drawText() {}, _text: item.description, _selectedItem: item
});
const list = inventory._itemWindow = Object.assign(new root.Window_ItemList(), windowFor(inventory), {
    _data: [item, armor], isFocused: true, isEnabled: () => true, needsNumber: () => true,
    itemIsEquipment: row => !!row.etypeId, item() { return this._data[this._index]; }
});
inventory._categoryWindow = windowFor(inventory, { _list: [{ name: 'Items', enabled: true }] });
const status = inventory._equipStatusWindow = list.statusWindow =
    Object.assign(new root.Window_EquipStatus(), windowFor(inventory), { _actor: actor,
        setTempActor(value) { this._tempActor = value; }, itemPadding: () => 2, paramY: i => i * 20,
        drawItem(x, y, id) { this.drawn.push(id); }, drawn: [] });
help.refresh();
frame(inventory);
assert.equal(spoken(), `Inventory, ${item.name}, 3, 1 of 2`);
assert.equal(records.at(-1).kind, 'menuFocus', 'manual mode gives a concise focus announcement');
const originalPage = menu.controlOwner(inventory);
assert(menu.command(originalPage, 'details'));
assert.equal(spoken(), item.description.split('\n').join('. '));
assert(menu.command(originalPage, 'reviewLast'));
const last = spoken();
assert(last.endsWith('2 of 2'));
help.refresh();
frame(inventory);
assert(menu.command(menu.controlOwner(inventory), 'reviewNext'));
assert.equal(spoken(), last, 'same-row redraw preserves and clamps the review cursor');

list._index = 1;
assert.equal(menu.command(originalPage, 'details'), false, 'the old subject closes at native selection');
help._selectedItem = armor;
help._text = armor.description;
help.refresh();
list.updateHelp();
status.drawAllParams();
assert.equal(status._wqaMenuCompareItem, armor);
assert.deepEqual(status.drawn, [0, 1, 2, 3]);
preferences.autodetail = true;
frame(inventory);
assert.equal(records.at(-2).kind, 'menuFocus');
assert.equal(records.at(-1).append, true);
assert(spoken().includes(`${terms[2]} 5 to 7`));
assert.equal(records.at(-1).lines.filter(line => line.includes(' to ')).length, 4);
status.worldVisible = false;
assert.equal(menu.command(menu.controlOwner(inventory), 'details'), false);
frame(inventory);
assert(!spoken().includes(`${terms[2]} 5 to 7`));
inventory._wqaSettingsActive = true;
frame(inventory);
assert.equal(menu.controlOwner(inventory), null);
inventory._wqaSettingsActive = false;
frame(inventory);
assert(menu.controlOwner(inventory));

let page = menu.controlOwner(inventory);
assert(menu.command(page, 'reviewLast'));
const atLast = spoken();
inventory._actorWindow = { active: true };
frame(inventory);
assert.equal(menu.controlOwner(inventory), null);
inventory._actorWindow.active = false;
frame(inventory);
page = menu.controlOwner(inventory);
assert(menu.command(page, 'reviewNext'));
assert.equal(spoken(), atLast, 'returning from the native actor overlay restores the current cursor');

const categories = inventory._categoryWindow = Object.assign(new root.Window_ItemCategory(), windowFor(inventory), {
    _list: [], isFocused: true, hoverIndex: -1,
    addCommand(name, symbol) { this._list.push({ name, symbol, enabled: true }); },
    maxItems() { return this._list.length; },
    smoothSelect(index) { this._index = index; this.hoverIndex = -1; },
    isCurrentItemEnabled: () => true,
    updateInputData() {},
    deactivate() { this.active = false; },
    callOkHandler() { list.active = true; }
});
categories.makeCommandList();
list.isFocused = false;
assert.equal(categories._list.length, 3);
categories.processOk();
assert.equal(categories.active, false, 'the native category still has visual focus after deactivation');
frame(inventory);
assert.equal(records.at(-1).name, categories._list[0].name);
for (let index = 1; index < categories._list.length; index++) {
    categories.cursorPagedown();
    frame(inventory);
    assert.equal(records.at(-1).name, categories._list[index].name);
    assert.equal(records.at(-1).position, index + 1);
}
categories.hoverIndex = 0;
frame(inventory);
assert.equal(records.at(-1).name, categories._list[0].name);
categories.hoverIndex = -1;
categories.isFocused = false;
list.isFocused = true;
frame(inventory);
assert.equal(menu.controlOwner(inventory).window, list);
assert(menu.command(menu.controlOwner(inventory), 'reviewLast'));
const countBeforeStableFrames = records.length;

function stableFrames() {
    const start = performance.now();
    for (let index = 0; index < 400; index++) frame(inventory);
    return performance.now() - start;
}
const update = root.WendyQuestAccessMenuReady;
delete root.WendyQuestAccessMenuReady;
const baseline = stableFrames();
root.WendyQuestAccessMenuReady = update;
const enabled = stableFrames();
assert.equal(renderer.listenerCount('postrender'), 0);
assert.equal(records.at(-1).kind, 'menuReview');
assert.equal(records.length, countBeforeStableFrames);
console.log(`Verified installed pause, Inventory category and item focus, review, and equipment comparison. ` +
    `400 stable fixture frames ${baseline.toFixed(2)} ms baseline, ${enabled.toFixed(2)} ms enabled.`);

// A native scroll redraws the selected item and its help after focus first
// settles. Paint revisions revoke Details until postrender, not the logical
// focus. Use the owner's exact two item identities and native help writer.
{
    const medium=data('Items')[16];
    const breakfast=data('Items')[25];
    assert(medium&&breakfast);preferences.autodetail=false;preferences.indexing=false;
    list._data=[medium,breakfast];list._index=0;
    help._selectedItem=medium;help._text=medium.description;help.refresh();frame(inventory);
    list._index=1;help._selectedItem=breakfast;help._text=breakfast.description;help.refresh();frame(inventory);
    assert.equal(records.at(-1).name,breakfast.name);
    const page=menu.controlOwner(inventory),count=records.length;
    for(let i=0;i<3;i++){
        list._wqaMenuRowPaint=(list._wqaMenuRowPaint||0)+1;help.refresh();
        assert.equal(menu.controlOwner(inventory),null,'unpainted Details remain closed');
        frame(inventory);assert.equal(menu.controlOwner(inventory),page);
    }
    assert.equal(records.length,count,'scroll repaint cannot repeat the selected item');
    assert(menu.command(page,'details'));assert.equal(spoken(),breakfast.description.split('\n').join('. '));
    root.$gameParty.numItems=()=>4;list._wqaMenuRowPaint++;frame(inventory);
    assert.equal(records.at(-1).quantity,4,'a real native quantity change still speaks');
    list._index=0;help._selectedItem=medium;help._text=medium.description;help.refresh();frame(inventory);
    list._index=1;help._selectedItem=breakfast;help._text=breakfast.description;help.refresh();frame(inventory);
    assert.equal(records.at(-1).name,breakfast.name,'returning to an item speaks again');
    list._data=[breakfast,{...breakfast}];list._index=0;frame(inventory);
    const before=records.length;list._index=1;help._selectedItem=list._data[1];help.refresh();frame(inventory);
    assert.equal(records.length,before+1,'different sources with identical text still speak');
    console.log('Native Medium Soda/Breakfast Baconator selection and repeated scroll/help repaint keep one focus; fresh Details, quantity changes, return selection and identical-name sources pass.');
}
