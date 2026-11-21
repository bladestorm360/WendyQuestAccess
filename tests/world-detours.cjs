'use strict';
const assert = require('node:assert/strict');
const { captureWorld } = require('../src/world/snapshot');
const { createTransferBookmarks } = require('../src/world/transfer-bookmarks');
const { createLocalDetour } = require('../src/world/local-detour');
const { solveRoute } = require('../src/world/routes.cjs');

async function verifyWorldDetours(c, load, verifyWorker, common, infos) {
    const prior = { common: c.$dataCommonEvents, infos: c.$dataMapInfos };
    c.$dataCommonEvents = common; c.$dataMapInfos = infos;
    const transfers = createTransferBookmarks(c, { graphics: c.Graphics, navigationPreferences: () => ({ spoilers: true }) });
    const states = { switches: [54, 90, 97, 72, 464, 465], variables: { 5: 4, 4: 3 } };
    const copy = ({ event, map, x, y, approach }) => ({ event, map, x, y, approach });
    try {
        for (const targetId of [43, 34]) {
            for (const north of [false, true]) {
                const origin = load(113, states);
                origin.player.setPosition(43, north ? 28 : 30);
                const world = captureWorld(c).live;
                const { entrances, state } = transfers.candidates();
                const worldEntries = entrances.map(copy);
                const target = { id: targetId, category: 'exits', name: targetId === 43 ? 'Cauldron' : 'Mech Café',
                    x: origin.gameMap._events[targetId]._x, y: origin.gameMap._events[targetId]._y };
                const job = { action: 'directions', map: 113 };
                const detour = createLocalDetour(c, transfers);
                const request = { x: 43, y: north ? 28 : 30, event: targetId, field: true, stopBeforeEvent: true,
                    detour: detour.prepare(job, { map: 113, mode: 'walk', live: world }, target) };
                assert.notEqual(job.detourApproach.world.terrain, world.terrain, 'retained terrain owns its buffer');
                structuredClone({ terrain: world.terrain }, { transfer: [world.terrain.buffer] });
                structuredClone(job.detourApproach.world);
                // Continue with the retained copy after the production handoff.
                world.terrain = job.detourApproach.world.terrain.slice();
                let points;
                await verifyWorker(origin, request, world, result => {
                    assert.equal(result.status, 'ready');
                    assert.equal(result.entrance, north ? 56 : 52);
                    assert.equal(result.approach, north ? 2 : undefined);
                    points = result.detourPoints;
                    assert(detour.accept(job, result));
                });
                const ticket = job.remote.selection;
                // Keep the exact selected object through each accepted native
                // landing, without creating a saved bookmark or new list item.
                const chain = north ? [[76,15,1,113],[113,43,30,209],[209,6,14,52],[52,12,93,45],[45,16,13,113]] :
                    [[209,6,14,52],[52,12,93,45],[45,16,13,113]];
                for (const [map,x,y,next] of chain) {
                    const f = load(map, states); f.player.setPosition(x,y);
                    // Native encounters are fought normally. This continuation
                    // case represents the user's already-cleared route.
                    for (const event of f.gameMap.events()) if (event.page()?.list.some(row => row.code === 301)) event._erased = true;
                    const live = captureWorld(c).live;
                    const current = transfers.candidates();
                    const selected = current.entrances.map(copy);
                    assert(selected.length, 'verified exits on map ' + map);
                    await verifyWorker(f, { x,y,field:true,transfer:{map:113,points,world,worldEntries,
                        state:current.state,candidates:selected} }, live, result => {
                        assert.equal(result.status,'ready','map ' + map);
                        const edge=current.entrances.find(edge=>edge.event===result.entrance&&edge.approach===result.approach);
                        assert.equal(edge?.map,next,'onward map from ' + map);
                    });
                }
                const f = load(113,states); f.player.setPosition(44,21);
                const end = solveRoute(f.geometry,captureWorld(c).live,{x:44,y:21,event:targetId,field:true,stopBeforeEvent:true});
                assert.equal(end.status,'interrupted'); assert.equal(end.boundaryEvent,targetId);
                assert(ticket.detour.target.id===targetId);
                detour.settle({...ticket,trail:['113/44/21']});
                let restored;
                assert(detour.resume({}, {map:113,mode:'walk',objects:[target]},()=>assert.fail('already on world map'),
                    (_job,_snapshot,t)=>restored=t));
                assert.equal(restored,target);
                detour.clear();
                assert(!detour.resume({}, {map:113,mode:'walk',objects:[target]},()=>{},()=>{}));
            }
        }
        console.log('Verified both Sunrise Bay approaches through Nugget Mine to Cauldron/Mech Café, selection retention and live encounter prerequisites.');
    } finally { transfers.clear(); c.$dataCommonEvents=prior.common; c.$dataMapInfos=prior.infos; }
}
module.exports = { verifyWorldDetours };
