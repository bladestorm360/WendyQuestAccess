'use strict';

const { saltState, saltControlName } = require('./salt-state.cjs');

const MAP = 19;
const CRYSTALS = [19, 20, 21, 22];
const CLUES = [114, 115];
const CHESTS = [6,5,4,3]; // authored southern-to-northern treasure approaches
const ORDER = 'yellow, blue, green, then red';

function createSaltGuide(root) {
    const visits = new WeakMap();

    function available(scene) {
        return scene?._wqaMapRestored && !scene._wqaBattleStarted && root.$gameMap?._mapId === MAP;
    }

    function visitFor(scene) {
        if (!available(scene)) return null;
        let visit = visits.get(scene);
        if (visit?.data !== root.$dataMap) {
            visit = { data: root.$dataMap, active: false, reset: '', signature: null, pending: false, colors: false };
            visits.set(scene, visit);
        }
        return visit;
    }

    function presented(scene, paint) {
        if (!available(scene) || scene._wqaTerrainWork || paint.end !== paint.text.length) return;
        const source = root.$gameMessage?.interpreter;
        if (source?._mapId !== MAP || source._waitMode !== 'message') return;
        const id = source._eventId;
        if (id === 97 && source._index === 51 && source._list === root.$dataMap.events[id].pages[0].list) {
            const visit = visitFor(scene);
            visit.reset = root.$gameMap._interpreter === source ? 'The crystals were reset. ' : 'The crystal attempt reset. ';
        } else if (CRYSTALS.includes(id)) {
            visitFor(scene).reset = '';
        }
    }

    function progress(scene) {
        const visit=visitFor(scene),state=visit && saltState(root);
        if(!state)return null;
        let collected=0;
        for(const [bit,id]of CHESTS.entries())if(root.$gameSelfSwitches?.value?.([MAP,id,'A'])===true)collected|=1<<bit;
        // The real rendezvous records reaching the final chamber. Direct
        // free-roaming arrival at a colored crystal also qualifies; no guide
        // counter or assumed sequence can substitute for native progress.
        const player=root.$gamePlayer;
        const near=CRYSTALS.some(id=>{
            const actor=root.$gameMap._events?.[id];
            return actor && Math.abs(actor._x-player?._x)+Math.abs(actor._y-player?._y)<=1;
        });
        visit.colors ||= state.order>0 || state.hits>0 || state.finalOpen || near ||
            root.$gameSelfSwitches?.value?.([MAP,18,'A'])===true;
        return {visit,state,collected,key:[state.mask,state.order,state.hits,+state.eastOpen,+state.finalOpen,collected,+visit.colors].join('/')};
    }

    function review(scene, objects) {
        const current=progress(scene);
        if(!current)return null;
        const {visit,state,collected}=current;
        visit.active=true;visit.pending=false;visit.signature=current.key;
        const select=id=>objects.find(item=>item.id===id && item.category!=='quests');
        const prefix=visit.reset+'Salt Caverns. ';
        const next=CHESTS.find((id,bit)=>!(collected & (1<<bit)));
        if(next){
            const count=CHESTS.filter((id,bit)=>collected & (1<<bit)).length;
            const text=prefix+count+' of 4 chests collected. Follow the terrain-crystal route to the next unopened chest.';
            return {target:select(next),text,readyText:prefix+'Open the chest.',terrainOnly:true};
        }
        if(state.finalOpen || state.order===4)
            return {target:select(2),text:prefix+'The color sequence is complete. Follow directions to the north exit.'};
        if(!visit.colors)
            return {target:select(19),text:prefix+'All four chests collected. Reach the northern crystal chamber.'};
        const step=state.order;
        if(state.hits & (1<<step))return {target:select(97),text:prefix+
            'This attempt needs a reset. Use Crystal reset, then hit the colors in order: '+ORDER+'.'};
        const plan=prefix+step+' of 4 colors complete. Color order is '+ORDER+'.';
        return {target:select(CRYSTALS[step]),text:plan,
            readyText:plan+' Activate the '+saltControlName(CRYSTALS[step]).toLowerCase()+'.'};
    }

    function observe(scene) {
        if(!visits.get(scene)?.active)return false;
        const current=progress(scene);
        if(!current)return false;
        if(current.key!==current.visit.signature){current.visit.signature=current.key;current.visit.pending=true;}
        return current.visit.pending;
    }

    return {
        available, presented, review, observe,
        active(scene) { return visits.get(scene)?.active === true; },
        stop(scene) {
            const visit = visits.get(scene);
            if (!visit?.active) return false;
            visit.active = false;visit.pending=false;
            return true;
        },
        label(_scene, id, fallback) {
            if (CLUES.includes(id)) return 'Wall clue';
            return saltControlName(id) || fallback;
        }
    };
}

module.exports = { createSaltGuide };
