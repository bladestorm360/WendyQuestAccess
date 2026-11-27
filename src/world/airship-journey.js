"use strict";

const { parkedVehicle, vehicleOnMap } = require('./vehicle-navigation');
const { eventTarget, bookmarkId } = require('./snapshot');
const { collectQuestDestinations } = require('./quest-destinations');

// One temporary selected goal crosses native vehicle modes. It is never a
// saved bookmark or worker payload; only copied IDs enter landing tickets.
function createAirshipJourney(root, host) {
    let trip = null;
    let serial = 0;
    const clear = () => { trip = null; };
    function target(scene, goal) {
        if (goal.saved) {
            const entry = host.bookmarks().find(item => item.id === goal.saved.id && item.revision === goal.saved.revision);
            return entry ? { id: bookmarkId(entry.id), category: 'bookmarks', name: entry.name, saved: entry } : null;
        }
        const event = root.$gameMap._events?.[goal.id];
        const entry = root.$dataMap?.events?.[goal.id], page = entry?.pages?.[event?._pageIndex];
        if (!event || event._erased || !page) return null;
        if (goal.category === 'quests') {
            const quest = collectQuestDestinations(root, scene, 'walk')?.get(goal.id);
            return quest ? { ...goal, quest, x: event._x, y: event._y } : null;
        }
        const info = eventTarget(root, 'walk', event, entry, page, host.spoilers());
        return info?.category === goal.category ? { ...info, id: goal.id, x: event._x, y: event._y,
            normal: event._priorityType === 1, trigger: event._trigger } : null;
    }
    function current() {
        if (trip && (trip.player !== root.$gamePlayer || trip.map !== root.$gameMap ||
            root.$gameMap._mapId !== 113 || vehicleOnMap(root.$gameMap, 'airship') !== trip.craft)) clear();
        return trip;
    }
    return {
        clear,
        questChanged() { if (trip?.goal.category === 'quests') clear(); },
        board(job, result) {
            const plan = result.airshipBoarding, craft = parkedVehicle(root.$gameMap, 'airship');
            const selected = job.destination;
            // Local walking bookmarks are ordinary point/entity targets in
            // their native mode. Preserve their saved revision for the later
            // vehicle-mode owner as well as already-remote saved selections.
            const saved = selected?.category === 'bookmarks' && host.bookmarks().find(entry => bookmarkId(entry.id) === selected.id);
            const goal = saved ? { ...selected, saved: { id: saved.id, revision: saved.revision } } : selected;
            if (!plan || !craft || craft._x !== plan.x || craft._y !== plan.y || !goal ||
                !target(job.scene, goal) || serial >= 0x7ffffffe) return null;
            trip = { serial: ++serial, player: root.$gamePlayer, map: root.$gameMap, craft,
                goal, stage: 'board', selectionMode: 'walk' };
            return { id: 516, x: craft._x, y: craft._y, category: 'vehicles', name: 'Airship', vehicle: 'airship' };
        },
        decorate(scene, snapshot, browser) {
            const state = current();
            if (!state) return;
            if (snapshot.mode === 'airship' && state.stage === 'board') state.stage = 'flight';
            if (snapshot.mode === 'walk' && state.stage === 'flight') { clear();return; }
            if (!['walk','airship'].includes(snapshot.mode)) { clear();return; }
            const goal = state.stage === 'discovery' ? { id: state.discovery, category: 'events' } : state.goal;
            const selected = target(scene, goal);
            if (!selected) { clear();return; }
            if (snapshot.mode === 'airship' && !snapshot.objects.some(item => item.id === selected.id && item.category === selected.category))
                snapshot.objects.push(selected);
            if (state.selectionMode !== snapshot.mode || state.restore) {
                browser.category = selected.category;
                browser.selections[selected.category] = selected.id;
                state.selectionMode = snapshot.mode;
                state.restore = false;
            }
            // Saved selections already have a native vehicle/transfer owner.
            // Hand that owner back its actual saved ID/revision, once aboard.
            if (selected.saved && snapshot.mode === 'airship' || state.stage === 'ground') clear();
        },
        landing(job, result) {
            let state = current();
            // A player can select an event after boarding independently of
            // the walking-airship suggestion. Retain that exact ground goal
            // through the existing native landing acceptance ticket as well.
            const goal=job.destination,craft=vehicleOnMap(root.$gameMap,'airship');
            if(job.mode==='airship'&&goal?.category==='events'&&craft?._driving&&
                (!state||state.goal.id!==goal.id||state.goal.category!==goal.category)&&
                serial<0x7ffffffe&&target(job.scene,goal))
                state=trip={serial:++serial,player:root.$gamePlayer,map:root.$gameMap,craft,
                    goal,stage:'flight',selectionMode:'airship'};
            if (!state || state.stage !== 'flight' || job.destination?.id !== state.goal.id ||
                job.destination.category !== state.goal.category) return;
            state.discovery = result.discovery;
            host.transfers.armAirship(job.scene, { airshipJourney: state.serial, landing: true, trail: [] }, result.arrival);
        },
        discovery(job) {
            const state = current();
            if (!state || state.stage !== 'discovery' || job.destination?.id !== state.discovery) return;
            const edge = host.transfers.discovery(state.discovery, state.goal.id);
            if (edge) host.transfers.arm(job.scene, { airshipJourney: state.serial, trail: [] }, edge);
        },
        settle(arrived) {
            if (!arrived?.airshipJourney) return false;
            const state = current();
            if (!state || arrived.airshipJourney !== state.serial) return true;
            state.stage = arrived.landing && state.discovery ? 'discovery' : 'ground';
            state.restore = true;
            return true;
        }
    };
}

module.exports = { createAirshipJourney };
