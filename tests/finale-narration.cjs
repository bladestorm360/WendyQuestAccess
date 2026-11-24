'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const cues = require('../src/dialogue/narration-cues.json');

module.exports = function verifyFinale(fixture, commandContext, stock) {
    const common = JSON.parse(fs.readFileSync(path.join(stock, 'package.nw/data/CommonEvents.json'), 'utf8'));
    const nativeTroops = JSON.parse(fs.readFileSync(path.join(stock, 'package.nw/data/Troops.json'), 'utf8'));
    let count = 0;
    for (const [id, cue] of Object.entries(cues)) {
        for (const [m, e, p, i, a, switched, visual] of cue.beats) {
            if (visual !== -6 || id === 'wendy-arrival-ripple') continue;
            const f = fixture(m, e, p), source = f.actor(a);
            const actor = source.candidate;
            Object.assign(actor, { _realX: 2, _realY: 2, _direction: 2, forceMoveRoute(route) { this.route = route; } });
            f.nativeMap._displayX = f.nativeMap._displayY = 0;
            f.spriteset._tilemap.worldVisible = true;
            f.root.$gameScreen._pictures = {};
            const image = (slot, name, animated = false) => {
                const parent = f.spriteset._pictureContainer_upper ||= { children: [] };
                const data = { _name: name, _opacity: 0, _animated: animated, _duration: 60, _y: 16 };
                const sprite = { parent, _pictureId: slot, _pictureName: name, _frameAnimator: animated ? {} : null,
                    texture: { valid: false }, worldVisible: true, worldAlpha: 1, worldTransform: { tx: 100, ty: 60 } };
                parent.children.push(sprite);f.status._pictures[slot] = data;
                return () => { data._opacity = 255; data._y = -20; sprite.texture.valid = true; };
            };
            const mech = () => {
                const sprite = { parent: f.spriteset._tilemap, texture: { valid: true }, worldVisible: true,
                    worldAlpha: 1, _frame: { x: 0, y: 176 } };
                const data = { animationPath: 'img/objects/BIGMECHWORLD.json', sprite,
                    frameAnimator: { _sprite: sprite }, currentAnimation: '_default' };
                f.nativeMap._events[18] = { animationData: data };
                return data;
            };
            let reveal;
            if(id==='shrine-lights') {
                const mask=f.spriteset._lightmask={parent:f.spriteset,worldVisible:true,_sprites:[{}]};
                reveal=()=>mask._sprites=[];
            } else if(id==='shrine-reunion') {
                f.status._tone=[255,255,255,0];
                for(const id of [1,22]) {
                    const a=f.actor(id);a.candidate._pageIndex=0;
                    a.candidate._characterName=a.sprite._characterName=f.root.$dataMap.events[id].pages[0].image.characterName;
                }
                reveal=()=>f.status._tone=[0,0,0,0];
            } else if(id==='grunt-ambush') {
                const actors=[18,19,20,22].map(id=>{
                    const a=f.actor(id),spawn=f.root.$dataMap.events[id];
                    Object.assign(a.candidate,{_characterName:'~MechGrunt',_realX:spawn.x,_realY:spawn.y});
                    a.sprite._characterName='~MechGrunt';return a;
                });
                reveal=()=>actors[0].candidate._realX--;
            } else if(id==='party-jailed') {
                actor._x=actor._y=2;reveal=()=>{actor._x=6;actor._y=5;};
            } else if(id==='jail-breach') {
                actor._characterName=source.sprite._characterName='~Chomps';
                f.spriteset._tilemap._mapData=[...f.root.$dataMap.data];
                reveal=()=>f.spriteset._tilemap._mapData[(12+1)*12+5]++;
            } else if(id==='jail-impact') {
                f.spriteset.x=f.spriteset.y=0;reveal=()=>f.spriteset.x=3;
            } else if(['sir-chicken-advances','chomps-walks-away'].includes(id))reveal=()=>actor._realX++;
            else if (id === 'elder-tater-shout') { f.spriteset.x = f.spriteset.y = 0;reveal = () => f.spriteset.x = 3; }
            else if (id.startsWith('stone-')) {
                const slots = { 'stone-frygor': [21, 'Fries'], 'stone-frostyna': [22, 'Frosty'],
                    'stone-sir-chicken': [20, 'Nugget'], 'stone-baconator': [23, 'Bacon'] };
                const [slot, type] = slots[id];reveal = image(slot, 'img/UI/CORNER STONE - ' + type + '.json', true);
            } else if (id === 'big-mech-reveal') { mech();reveal = image(8, 'pictures/Curtain'); }
            else if (id === 'double-mech-transform') { const m = mech();reveal = () => { m.currentAnimation = 'transform';m.sprite._frame.x = 320; }; }
            else if (id === 'double-mech-crumble') { const m = mech();reveal = () => m.currentAnimation = 'destruction'; }
            else if (id === 'companions-take-stones' || id === 'prologue-march') {
                const members = (id === 'prologue-march' ? [7, 8, 9] : [5, 6, 7, 8]).map(n => {
                    const member = n === a ? source : f.actor(n);member.candidate._realX = member.candidate._realY = 2;return member;
                });
                reveal = () => members.forEach(member => member.candidate._realY++);
            } else if (id === 'chomps-arms') reveal = () => {
                actor._characterName = source.sprite._characterName = 'CHOMPS';actor._characterIndex = 4;actor._pattern = 0;
            };
            else if (id === 'chomps-flash') reveal = image(29, 'white');
            else if (id === 'wendy-departure-light') reveal = image(22, 'ParticleEffects/GOD-RAYS-FOR-WENDY-ASCENSION');
            else if (id === 'wendy-ascends') reveal = image(23, 'objects/Wendy');
            else if (id === 'epilogue-glitch') {
                const show = image(3, 'Credits/017 HOT SLUDGE SUNDAE f18484');
                reveal = () => { show();f.nativeMap.filters.rgb = {}; };
            } else if (id.startsWith('tyler-')) reveal = () => actor._jumpCount = 20;
            else if (id === 'prologue-islands' || id === 'prologue-ruins') reveal = () => f.nativeMap._displayX++;
            else if (id === 'ice-machine-arrives') {
                actor._characterName = source.sprite._characterName = '~ICM';actor._characterIndex = 5;
                reveal = () => { actor._jumpCount = 10; };
            }
            else if (id === 'prologue-emblem') reveal = image(4, 'pictures/MECHBORGLOGO');
            else if (id === 'wendy-wakes') { actor._transparent = true;reveal = () => { actor._transparent = false;f.switches.add(22); }; }
            else if (id === 'wendy-looks-around') reveal = () => actor._direction = 4;
            assert(reveal, id);
            f.nativeMap.refreshIfNeeded = () => {};
            f.root.$gameSwitches.setValue = (key, value) => value ? f.switches.add(key) : f.switches.delete(key);
            f.root.AudioManager = { playSe() {} };
            f.root.$dataCommonEvents = common;
            Object.assign(f.interpreter, { _index: i, character: () => actor, setWaitMode() {},
                isOnCurrentMap: () => true, setupChild(list) { this._childInterpreter = { _list: list }; } });
            const c = commandContext(f), row = f.interpreter._list[i];
            assert(c.Game_Interpreter.prototype['command' + row.code].call(f.interpreter, row.parameters), id);
            f.frame();assert.equal(f.played.length, 0, id + ': commands alone are silent');
            // Actual long scripted delays must survive more than the ordinary
            // twenty-frame balloon window without publishing an unseen effect.
            for (let n = 0; n < 30; n++) f.frame();
            reveal();f.frame(false);assert.equal(f.played.length, 0);f.renderer.emit('postrender');
            assert.equal(f.played[0]?.id, id);
            f.narration.leave(f.scene);assert(f.played[0].paused);count++;
        }
    }
    for(const [event,page,index,id,actorId] of [[6,0,14,'party-jailed',-1],[10,1,72,'jail-breach',11]]) {
        const f=fixture(134,event,page),a=f.actor(actorId);
        f.interpreter._index=index;f.status._brightness=0;
        f.spriteset._tilemap.worldVisible=true;
        Object.assign(a.candidate,{_x:6,_y:5});
        if(actorId===11) {
            a.candidate._characterName=a.sprite._characterName='~Chomps';f.switches.add(77);
            f.spriteset._tilemap._mapData=[...f.root.$dataMap.data];
            f.spriteset._tilemap._mapData[(12+1)*12+5]++;
        }
        f.frame();assert.equal(f.played.length,0,'no observation during native fade');
        f.status._brightness=255;a.sprite.worldVisible=false;f.frame();assert.equal(f.played.length,0);
        a.sprite.worldVisible=true;f.frame(false);assert.equal(f.played.length,0);
        f.renderer.emit('postrender');assert.equal(f.played[0]?.id,id);
        f.narration.pause(f.scene,true);f.frame();assert.equal(f.played.length,1,'confirmed voice resumes through fade');
        f.played[0].emit('ended');f.frame();assert.equal(f.played.length,1,'same native event is not repeated');
        f.narration.leave(f.scene);
    }
    {
        const f=fixture(197,20,0),script={_list:common[58].list,_index:4};
        f.root.$dataCommonEvents=common;f.root.$gameTroop=null;
        f.interpreter._childInterpreter={_childInterpreter:{_childInterpreter:script}};
        f.root.$gameScreen.startFlash=color=>f.status._flashColor=color;
        f.spriteset.x=f.spriteset.y=0;f.spriteset._tilemap.worldVisible=true;
        const c=commandContext(f);c.$dataCommonEvents=common;
        assert(c.Game_Interpreter.prototype.command224.call(script,common[58].list[4].parameters));
        f.frame();assert.equal(f.played.length,0,'upgrade flash without its screen motion stays silent');
        f.spriteset.x=2;f.frame(false);assert.equal(f.played.length,0);
        f.renderer.emit('postrender');assert.equal(f.played[0]?.id,'ability-upgrade');
        f.narration.leave(f.scene);
        script._list=[];f.narration.accepted(f.scene,script,f.root.$gamePlayer,undefined,-13);
        f.frame();assert.equal(f.played.length,1,'unrelated flash cannot claim upgrade');
    }
    {
        const f = fixture(188, 1, 0, false);
        f.narration.warm(f.scene);assert.equal(f.narration.needsPack, false, 'the prologue warms with its interpreter active');
    }
    {
        const f = fixture(107, 3, 3), boss = f.actor(38);
        const troop = f.root.$gameTroop = { _troopId: 96, _interpreter: { _list: nativeTroops[96].pages[5].list } };
        f.root.$dataTroops = nativeTroops;
        f.scene._wqaBattleStarted = true;
        const field = f.spriteset._battleField = {};
        const art = { worldVisible: true, worldAlpha: 1, bitmap: { isReady: () => true } };
        f.spriteset._enemySprites = [{ parent: field, worldVisible: true, worldAlpha: 1, _mainSprite: art, _enemy: { _enemyId: 38 } }];
        f.root.$gameScreen.startFlash = color => f.status._flashColor = color;
        troop._interpreter.wait = () => {};
        const c = commandContext(f);
        c.WendyQuestAccessFinaleBattle = f.narration.battleAccepted;
        for (const index of [7, 15]) {
            troop._interpreter._index = index;
            assert(c.Game_Interpreter.prototype.command224.call(troop._interpreter, troop._interpreter._list[index].parameters));
            f.frame();
        }
        assert.equal(f.played[0]?.id, 'double-mech-explosion');
        assert.equal(f.played.length, 1);assert(!f.played[0].paused);
        f.played[0].emit('ended');f.frame();assert.equal(f.played[1]?.id, 'double-mech-explosion-again');
        f.narration.leave(f.scene);assert(f.played[1].paused);
    }
    {
        const f = fixture(107, 3, 3);
        f.scene._wqaBattleStarted = true;
        f.root.$dataTroops = nativeTroops;
        const interpreter = { _list: nativeTroops[96].pages[4].list };
        f.root.$gameTroop = { _troopId: 96, _interpreter: interpreter };
        f.root.BattleManager = { _action: { item: () => ({ id: 123 }) } };
        const actor = { _actor: { _actorId: 1 }, x: 300, y: 180, _frameAnimator: { SetAnimation() {} } };
        f.spriteset._actorSprites = [actor];
        const functions = [], effects = [];
        const ctx = vm.createContext({ BattleAnimations: {}, SceneManager: { _scene: f.scene },
            a2_0x990531() { throw Error('Unresolved effect property'); },
            CoroutineChain: class {
                AddFunction(fn) { functions.push(fn);return this; } AddDelay() { return this; }
                AddCoroutine() { return this; } Start() {}
            }, OverTime: class {}, CoroutineManager: { StartAnonymousCoroutine() {} },
            SpriteEffectHelper: {
                Effects: Object.fromEntries(['Combined', 'Fries', 'Frosty', 'Nugget', 'Bacon'].map(name => ['CornerStone_' + name, name])),
                CreateParticleEffectSprite(x, y, name, parent) {
                    const sprite = { parent, x, y, scale: { x: 1, y: 1 }, texture: { valid: false }, worldVisible: true,
                        worldAlpha: 1, animator: { _animationData: { fileName: 'ParticleEffects/CornerStone_' + name } } };
                    effects.push(sprite);return sprite;
                }
            }, $gameScreen: { startTint() {} },
            WendyQuestAccessFinaleStones: (scene, source, combined, stones) => f.narration.battleAccepted(scene, null, source, combined, stones)
        });
        const methods = JSON.parse(execFileSync('python', ['-B', path.join(__dirname, 'battle-focus-producers.py'), stock, 'finale'],
            { encoding: 'utf8', timeout: 7000 }));
        for (const source of methods) vm.runInContext(source, ctx);
        ctx.BattleAnimations.CornerStone(actor);
        for (const fn of functions.slice(0, 4)) fn();
        assert.equal(effects.length, 5);f.frame();assert.equal(f.played.length, 0);
        for (const effect of effects) effect.texture.valid = true;
        const combined = effects[0];combined.worldVisible = false;f.frame();assert.equal(f.played.length, 0);
        combined.worldVisible = true;f.frame(false);assert.equal(f.played.length, 0);f.renderer.emit('postrender');
        assert.equal(f.played[0]?.id, 'stones-unite');
        f.narration.leave(f.scene);assert(f.played[0].paused);
    }
    {
        const f = fixture(13, 5, 0), sleeper = f.actor(17);
        sleeper.candidate._characterName = sleeper.sprite._characterName = 'WendyWorld';
        sleeper.candidate._characterIndex = 3;
        Object.assign(f.interpreter, { _index: 38, _waitCount: 120 });
        f.status._pictures = { 1: { _opacity: 255 }, 2: { _opacity: 255 } };
        f.nativeMap.filters.ref = { currentParams: [0, 16, 16, 30, 30, 0, 0] };
        f.scene._wqaPreloads = new Set([{}]);f.narration.prologue(f.scene);assert(!f.scene._wqaArrivalObserved);
        f.scene._wqaPreloads.clear();f.narration.prologue(f.scene);assert(f.scene._wqaArrivalObserved);
        f.frame();assert.equal(f.played.length, 0, 'opaque native pictures still hide the beach');
        f.status._pictures[1]._opacity = f.status._pictures[2]._opacity = 150;
        sleeper.sprite.worldVisible = false;f.frame();assert.equal(f.played.length, 0);
        sleeper.sprite.worldVisible = true;f.frame(false);assert.equal(f.played.length, 0);f.renderer.emit('postrender');
        assert.equal(f.played[0]?.id, 'wendy-arrival-ripple');
        f.narration.prologue(f.scene);f.frame();assert.equal(f.played.length, 1);
        f.narration.leave(f.scene);assert(f.played[0].paused);
    }
    console.log('Verified ' + count + ' finale, prologue and Tyler locators through native commands, delayed rendered effects, cold prologue loading, two queued native boss flashes and transition cancellation.');
};
