'use strict';

const { DIRECTIONS, PASSAGE, indexOf, tileKey } = require('../src/world/geometry.cjs');
const { prerequisiteLanding } = require('../src/world/terrain-controls.cjs');
const {floorClearsOnUse,iceOpensPassage,iceMeltChanges}=require('../src/world/local-destinations');
const {bakeControls}=require('./bake-controls.cjs');
const {GATE_SWITCHES}=require('../src/world/terrain-control-labels.cjs');
const {CONNECTION_GATES}=require('../src/world/transfer-gates.cjs');
const { catalogTransferOptions, shipPort } = require('../src/world/transfer-events.cjs');
const { MAX_LANDINGS, validTile, readCatalog } = require('../src/world/walking-catalog.cjs');
const { timedCave } = require('../src/world/puzzles/cave');
const { movingEnemy } = require('../src/world/destinations');

function transferMap(id, map, geometry, flags, common) {
    const events = [];
    const exits = [];
    const portLandings = [];
    const barriers = new Map();
    for (const entry of map.events) {
        if (!entry?.pages?.length) continue;
        const { id: event, x, y, pages } = entry;
        // An ordinary encounter is a reachable prerequisite, not a permanent
        // break in cross-map connectivity. The live local solver still stops
        // at the actual enemy and names the blocker before proceeding.
        const clearedEncounter = movingEnemy(pages[0]) && pages.some(page =>
            page.conditions.selfSwitchValid && page.conditions.selfSwitchCh === 'A' &&
            page.list.some(row => row.code === 214));
        const clearedFloorScene = pages.every(page => page.priorityType === 0 && !page.image?.tileId) &&
            pages.some(page => page.trigger === 1 && page.list.length === 2 &&
                page.list[0]?.code === 214 && page.list[1]?.code === 0 &&
                Object.entries(page.conditions).some(([key, value]) => key.endsWith('Valid') && value === true));
        if (clearedEncounter || clearedFloorScene) continue;

        const cell = indexOf(geometry, x, y);
        if (cell < 0) continue;
        // The projected map can add authored barriers but cannot infer a
        // remote switch has removed one. Native state is checked on arrival.
        // The harmless approach switch precedes the south cave exit.
        // Model its onward link only here. A live route stops at the switch.
        const caveSetup = id === 87 && event === 102 && pages.length === 1 &&
            pages[0].trigger === 1 && pages[0].priorityType === 0 && pages[0].list.length === 2 &&
            pages[0].list[0]?.code === 121 && pages[0].list[0].parameters.join(',') === '96,96,0';
        const action = page => !caveSetup && page.list.length > 1 && [0, 1, 2].includes(page.trigger);
        const blocked = pages.some(page => page.priorityType === 1 && !page.through);
        const floor = pages.find(page => page.priorityType !== 1 && page.trigger !== 0 && action(page));
        const normal = pages.find(page => page.priorityType === 1 && action(page));
        const interaction = floor || normal || pages.find(action);
        const ice=pages.find(page=>iceOpensPassage(entry,page));
        const box=ice&&pages.flatMap(page=>page.list).find(row=>row.code===357&&row.parameters[0]==='MapScene'&&
            row.parameters[1]==='SetBlocker')?.parameters[3];
        const rectangle = box ? [x+(+box.minX),y+(+box.minY),x+(+box.maxX),y+(+box.maxY)] :
            floor && blocked ? [x, y, x, y] : undefined;
        events.push({ id: event, x, y, normal: !floor && (blocked || !!normal),
            through: !blocked, rectangle, trigger: interaction?.trigger, action: !!interaction,
            meltable:!!ice, ...(ice?{meltChanges:iceMeltChanges(entry,ice)}:{}),
            clearsOnUse:pages.some(page=>floorClearsOnUse(entry,page)) });
        if (rectangle) events[events.length - 1].through = false;
        for (const page of pages) {
            const flag = page.image?.tileId > 0 ? flags[page.image.tileId] : undefined;
            if (!page.through && Number.isInteger(flag) && !(flag & 16))
                barriers.set(cell, (barriers.get(cell) || 0) | (flag & PASSAGE));
        }
        if (id === 185 || id === 198 || timedCave(id)) continue;
        for (const destination of catalogTransferOptions(id, entry, common))
            exits.push({ event, ...destination });
        const port = id === 113 && shipPort(entry, pages[0], common);
        if (port) portLandings.push(port);
    }
    const terrain = Array.from(barriers, ([cell, mask]) =>
        [cell % geometry.width, Math.floor(cell / geometry.width), geometry.cells[cell] & ~mask]);
    const controls=bakeControls(id,map,flags);
    const opening=controls?.find(([event])=>event===0)?.[1];
    const gate=id===63?CONNECTION_GATES.cauldronTiles:GATE_SWITCHES[id]===97?CONNECTION_GATES.breakfastBridges:undefined;
    return { geometry, live: { mode: 'walk', terrain, events, vehicles: [],terrainMap:id,terrainSwitch:GATE_SWITCHES[id] },
        exits, portLandings, controls, ...(opening&&gate?{conditional:{gate,changes:opening}}:{}) };
}

function encodePoints(reached) {
    const bits = Buffer.alloc(Math.ceil(reached.length / 8));
    for (let cell = 0; cell < reached.length; cell++) {
        if (reached[cell]) bits[cell >> 3] |= 1 << (cell & 7);
    }
    return bits.toString('base64');
}

function bakeCatalog(sources, maps) {
    const byTile = new Map();
    const origins = [];
    for (const source of sources.values()) {
        // Ports contribute arrival geometry. A walking route cannot use
        // a ship-only port as an outgoing link from the world map.
        for (const { map, x, y } of [...source.exits, ...source.portLandings]) {
            if (!validTile(map, x, y, maps)) continue;
            const key = tileKey(map, x, y);
            if (byTile.has(key)) continue;
            byTile.set(key, origins.length);
            origins.push([map, x, y]);
            if (origins.length > MAX_LANDINGS) throw Error('Too many walking landings');
        }
    }
    const landings = origins.map(([map, x, y]) => {
        const {geometry,live,exits,controls,conditional}=sources.get(map);
        const available=prerequisiteLanding(geometry,live,x,y,controls);
        const links=[];
        function append(reached,gate) {
            for(const edge of exits) {
                if(edge.approach?!(reached.approaches[edge.event]&(1<<DIRECTIONS.indexOf(edge.approach))):!reached.events[edge.event])continue;
                const next=byTile.get(tileKey(edge.map,edge.x,edge.y));
                if(next===undefined)continue;
                if(gate&&edge.gate!==0)throw Error('Unverified compound conditional connection');
                const value=gate||edge.gate;
                if(!links.some((item,i)=>i%2===0&&item===next&&links[i+1]===value))links.push(next,value);
            }
        }
        append(available,conditional?-conditional.gate:0);
        const row=[map,x,y,encodePoints(available.reached),links];
        if(conditional){
            const edits=new Map(live.terrain.map(([tx,ty,value])=>[ty*geometry.width+tx,value]));
            for(const [cell,flags]of conditional.changes)edits.set(cell,((edits.get(cell)??geometry.cells[cell])&240)|flags);
            const terrain=Array.from(edits,([cell,value])=>[cell%geometry.width,Math.floor(cell/geometry.width),value]);
            const opened=prerequisiteLanding(geometry,{...live,terrain},x,y,controls);
            append(opened,conditional.gate);
            row.push([conditional.gate,encodePoints(opened.reached)]);
        }
        return row;
    });
    const catalog = { version: 1, landings };
    readCatalog(catalog, maps);
    return catalog;
}

module.exports = { transferMap, bakeCatalog };
