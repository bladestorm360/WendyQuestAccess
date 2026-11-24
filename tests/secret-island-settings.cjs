/* Real DOM/IndexedDB fixture hosted only by the pinned hidden NW test app. */
'use strict';
const assert = require('assert').strict;
const {createSettingsMenu} = require('../src/settings/menu');
const {secretIslandAvailable} = require('../src/settings/secret-island');
const {openSettings} = require('../src/settings/storage');

async function verify(window) {
    const document=window.document;
    const scene={_wqaMapRestored:true};
    const root={document,indexedDB:window.indexedDB,SceneManager:{_scene:scene},$gameMap:{_mapId:206},
        $dataSystem:{locale:'en-US'},Input:{keyMapper:{}},addEventListener:(...args)=>window.addEventListener(...args)};
    const sleep=()=>new Promise(resolve=>setTimeout(resolve,5));
    async function until(test) {for(let n=0;n<400;n++){if(test())return;await sleep();}assert.fail('UI persistence did not settle');}
    function make(indexedDB=root.indexedDB) {
        const values={};
        const menu=createSettingsMenu({...root,indexedDB},{readyScene:()=>scene,fieldReady:()=>true,
            bookmarkContext:()=>null,selectBookmark:()=>false,capturePads(){},suspend(){},resume(){},audioStop(){},
            retireSpeechSilence(){},controllerChanged(){},navigationChanged:value=>values.navigation=value,
            audioChanged:value=>values.audio=value,speechChanged:value=>values.speech=value,battleChanged(){},
            previewAudio(_owner,_hrtf,_bearing,done,cue,gain){values.preview={cue,gain};done('Preview ready');return true;}});
        return {menu,values};
    }
    const labels=()=>Array.from(document.querySelectorAll('dialog button'),button=>button.textContent);
    const choose=prefix=>{const button=Array.from(document.querySelectorAll('dialog button')).find(button=>button.textContent.startsWith(prefix));assert(button,prefix);button.click();};
    const status=()=>document.querySelector('dialog [role=status]')?.textContent;
    const maps=new Set([206,196,199,200,201,202]);
    for(let map=1;map<=239;map++) {
        root.$gameMap._mapId=map;
        assert.equal(secretIslandAvailable(root,scene),maps.has(map),`context ${map}`);
    }
    root.$gameMap._mapId=206;
    scene._wqaMapRestored=false;assert(!secretIslandAvailable(root,scene));scene._wqaMapRestored=true;
    scene._wqaBattleStarted=true;assert(!secretIslandAvailable(root,scene));delete scene._wqaBattleStarted;
    let f=make();await until(()=>f.values.speech);
    assert.equal(f.values.audio.caveTiming,true);assert.equal(f.values.audio.caveVolume,65);
    assert.equal(f.values.navigation.caveAutomaticInteractions,false);
    for(const map of [206,196,199,200,201,202,197,198,113]) {
        root.$gameMap._mapId=map;assert(f.menu.open(scene));
        assert.equal(labels().includes('Secret Island'),maps.has(map));
        choose('Audio');assert(!labels().some(label=>/cave/i.test(label)),'global audio has no cave controls');
        choose('Sound previews');assert(!labels().some(label=>/cave/i.test(label)),'global previews have no cave controls');
        f.menu.retire(scene);
    }
    root.$gameMap._mapId=206;assert(f.menu.open(scene));choose('Secret Island');
    assert(labels().includes('Cave timing assist, on'));
    choose('Automatic interactions, off');await until(()=>status()==='Secret Island settings saved');
    assert(f.values.navigation.caveAutomaticInteractions);
    choose('Decrease cave timing volume');await until(()=>status()==='Secret Island settings saved');
    assert.equal(f.values.audio.caveVolume,55);
    choose('Cave timing assist, on');await until(()=>status()==='Secret Island settings saved');
    assert.equal(f.values.audio.caveTiming,false);
    choose('Preview cave crossing');assert.deepEqual(f.values.preview,{cue:'caveGo',gain:0.55});
    choose('Back');assert.equal(document.activeElement.textContent,'Secret Island');
    f.menu.retire(scene);

    const database=await openSettings(window.indexedDB);
    assert((await database.read('navigation')).caveAutomaticInteractions);
    assert.equal((await database.read('audio')).caveTiming,false);
    f=make();await until(()=>f.values.speech);
    assert(f.values.navigation.caveAutomaticInteractions);assert.equal(f.values.audio.caveVolume,55);
    // Upgrade an actual legacy profile: audio keys stay where they were and
    // the newly introduced navigation switch defaults off independently.
    const legacy={...(await database.read('navigation')),autowalk:true};delete legacy.caveAutomaticInteractions;
    await database.save(legacy,'navigation');
    await database.save({...f.values.audio,caveTiming:false,caveVolume:35},'audio');
    f=make();await until(()=>f.values.speech);
    assert(f.values.navigation.autowalk);assert.equal(f.values.navigation.caveAutomaticInteractions,false);
    assert.equal(f.values.audio.caveTiming,false);assert.equal(f.values.audio.caveVolume,35);

    // Exercise the settings owner's real asynchronous failure/rollback path.
    const failing={open(name,version){
        const native=window.indexedDB.open(name,version),request={};
        native.onsuccess=()=>{
            const database=native.result;
            request.result=new Proxy(database,{get(target,key){
                if(key==='transaction')return (...args)=>{if(args[1]==='readwrite')throw Error('Expected fixture write failure');return target.transaction(...args);};
                const value=target[key];return typeof value==='function'?value.bind(target):value;
            },set(target,key,value){target[key]=value;return true;}});
            request.onsuccess?.();
        };
        native.onerror=()=>{request.error=native.error;request.onerror?.();};return request;
    }};
    f=make(failing);await until(()=>f.values.speech);
    assert(f.menu.open(scene));choose('Secret Island');choose('Automatic interactions, off');
    await until(()=>status()?.startsWith('Could not save'));
    assert.equal(f.values.navigation.caveAutomaticInteractions,false);
    assert(labels().includes('Automatic interactions, off'));
    choose('Cave timing assist, off');await until(()=>status()?.startsWith('Could not save'));
    assert.equal(f.values.audio.caveTiming,false);assert(labels().includes('Cave timing assist, off'));
    f.menu.retire(scene);
    return {maps:239,allowed:Array.from(maps),profile:'default, persist/reopen, legacy and failed-save rollback passed',globalAudio:'cave controls removed'};
}
module.exports={verify};
