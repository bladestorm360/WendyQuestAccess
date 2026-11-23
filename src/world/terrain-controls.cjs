'use strict';

// The map-specific records are derived from the installed tile-edit commands.
// Only an active, reachable native control can become a prerequisite.
const { composeWorld, indexOf, step, MAX_EVENTS, MAX_CELLS, CELL_BITS } = require('./geometry.cjs');
const { solveRoute, solveWorldRoute, walkingLanding, encounterObstacles } = require('./routes.cjs');

function routeThroughControl(geometry, live, request, controls, cancelled, remoteAccess) {
    if (live.mode !== 'walk' || !controls || request.entrances || request.vehicle || request.area || request.motion)
        return null;
    const current = composeWorld(geometry, live, cancelled);
    if (!current) return { status: 'cancelled' };
    const map = live.terrainMap;
    const gate = live.terrainSwitch;
    if (gate && live.terrainGate !== false) return null;
    const remote = map === 204 || gate === 97;
    if (remote && request.refresh) return null;
    let best;
    for (const [id, changes, pull] of controls) {
        if (cancelled()) return { status: 'cancelled' };
        const control = current.events.find(event => event.id === id && event.action && !event.erased);
        if (!changes.length || id === request.event || (!remote && !control)) continue;
        const stepOn = control?.trigger === 1 && !control.normal;
        if (!remote && !stepOn && control.trigger !== 0) continue;
        const approach = remote ? null : solveWorldRoute(current, { x: request.x, y: request.y, event: id,
            field: true, stopBeforeEvent: stepOn }, cancelled);
        if (approach?.status === 'cancelled') return approach;
        const detour = pull && live.pullStage === 2 && id === 4 && approach?.status !== 'ready';
        // An ordinary button can itself lie behind ice, and its bridge can
        // lead to another ice reveal. Prove the whole chain in the same
        // bounded detached search; return only its first native prerequisite.
        const combine = !remote && !pull && !gate && !stepOn && control.trigger === 0
            ? () => routeThroughIce(geometry, live, request, cancelled, [], { id, changes }) : null;
        if (approach && !detour && (stepOn ? approach.status !== 'interrupted' || approach.boundaryEvent !== id
            : approach.status !== 'ready')) {
            const sequence = combine?.();
            if (sequence?.status === 'cancelled') return sequence;
            if (sequence && (!best || sequence.distance < best.distance)) best = sequence;
            continue;
        }
        let origin = stepOn && !remote ? control : approach?.arrival || request;
        if (pull && !detour) {
            let cell = indexOf(current, origin.x, origin.y);
            for (const heading of pull.pulled) {
                const next = step(current, cell, heading);
                if (next >= 0) cell = next;
                else if (!pull.skippable) { cell = -1; break; }
            }
            if (cell < 0) continue;
            origin = { x: cell % current.width, y: Math.floor(cell / current.width) };
        }
        // Model only the audited terrain change on a detached copy. The
        // approach to the control always used current collision and events.
        // Retire the used handle, or the duplicate floor trigger set, just
        // as their native page changes do. Rebuild collision on the worker.
        let projected = live.events;
        if (stepOn && !remote || pull)
            projected = projected.filter(event => !controls.some(([used]) => used === event.id));
        if (gate === 103) {
            // Chomps leaves the corridor, and the previously disabled
            // office door gets its normal-priority touch page.
            projected = projected.filter(event => event.id !== 8).map(event => event.id === 18
                ? { ...event, trigger: 1, normal: true, action: true, through: false } : event);
        }
        const opened = projected === live.events
            ? { ...current, cells: current.cells.slice() } : composeWorld(geometry, { ...live, events: projected }, cancelled);
        if (!opened) return { status: 'cancelled' };
        for (const [cell, flags] of changes) opened.cells[cell] = (opened.cells[cell] & 240) | flags;
        if (gate === 103) {
            // The native wall scene takes Wendy to the north end of the
            // corridor before releasing control. Verify each forward edge
            // of the authored continuation against the projected terrain.
            let cell = indexOf(opened, origin.x, origin.y);
            for (const heading of [3, 3, 3, 3, 3, 3, 2, 3, 3, 3]) {
                cell = step(opened, cell, heading);
                if (cell < 0) break;
            }
            if (cell < 0) continue;
            origin = { x: cell % opened.width, y: Math.floor(cell / opened.width) };
        }
        const onward = solveWorldRoute(opened, { ...request, x: origin.x, y: origin.y }, cancelled);
        if (onward.status === 'cancelled') return onward;
        let afterIce;
        if (onward.status !== 'ready' && onward.status !== 'interrupted') {
            if (gate !== 97) {
                const sequence = combine?.();
                if (sequence?.status === 'cancelled') return sequence;
                if (sequence && (!best || sequence.distance < best.distance)) best = sequence;
                continue;
            }
            // The bridge work can reveal an approach that is still blocked
            // by a separate, ordinary ice interaction. Verify both effects
            // on worker-owned copies before naming the first prerequisite.
            const next = routeThroughIce(geometry, { ...live, events: projected },
                { ...request, x: origin.x, y: origin.y }, cancelled, changes);
            if (next?.status === 'cancelled') return next;
            if (!next) continue;
            afterIce = next.event;
        }
        if (detour) {
            const exit = solveWorldRoute(current, { x: request.x, y: request.y, event: 2,
                field: true, bumpDirections: 15, handoffs: [8] }, cancelled);
            if (exit.status === 'ready' || exit.status === 'interrupted' && exit.boundaryEvent === 8)
                return { ...exit, status: 'terrainExit', event: 2, gate: 'pull' };
            if (exit.status === 'cancelled') return exit;
            continue;
        }
        if (remote) {
            const exit = map === 204 ? solveWorldRoute(current, { x: request.x, y: request.y,
                event: id, field: true, stopBeforeEvent: true }, cancelled) : remoteAccess?.();
            if (exit?.status === 'cancelled') return exit;
            if (exit && (exit.status === 'ready' || exit.status === 'interrupted' || exit.needsEncounter))
                return { ...exit, status: 'terrainExit', event: id, gate, ...(afterIce && { afterIce }) };
            return request.refresh ? null : { status: 'terrainGate', gate, ...(afterIce && { afterIce }) };
        }
        if (!best || approach.distance < best.distance)
            best = { ...approach, status: 'controlRoute', event: id, gate, step: stepOn };
    }
    return best || null;
}

// Native melt effects are copied IDs/coordinates, never game objects. The
// revealed chest stays solid, while an encounter actor retires only in this
// planning copy. Real movement and each next request use fresh native state.
function meltedEvents(geometry, events, ice, removed) {
    if (!removed) return events;
    const clears = new Set(), moved = new Map();
    for (const [slot, block] of ice.entries()) {
        if (!(removed & (1 << slot))) continue;
        clears.add(block.id);
        const change = block.meltChanges;
        if (change?.clears) {
            if (!Array.isArray(change.clears) || change.clears.length > 1 ||
                !change.clears.every(id => Number.isInteger(id) && id > 0 && id <= MAX_EVENTS))
                throw Error('Invalid melt actor');
            for (const id of change.clears) clears.add(id);
        }
        if (change?.relocate) {
            if (!Array.isArray(change.relocate)) throw Error('Invalid melt placement');
            const [id,x,y] = change.relocate;
            if (change.relocate.length !== 3 || !Number.isInteger(id) || id < 1 || id > MAX_EVENTS ||
                indexOf(geometry,x,y) < 0 || moved.has(id)) throw Error('Invalid melt placement');
            moved.set(id,{x,y});
        }
    }
    return events.filter(event => !clears.has(event.id)).map(event =>
        moved.has(event.id) ? {...event,...moved.get(event.id)} : event);
}

function routeThroughIce(geometry, live, request, cancelled, terrain = [], control, betterThan) {
    if (live.mode !== 'walk' || request.entrances || request.vehicle || request.area || request.motion) return null;
    const ice = live.events.filter(event => event.meltable && !event.erased && event.id !== request.event);
    if (!ice.length || ice.length > 8) return null;
    const queue = [{ x: request.x, y: request.y, removed: 0, opened: false, first: null, cost: 0 }];
    const visited = new Set();
    // A node clears only verified one-use blockers. Replay normal collision
    // and event ordering for each candidate approach. Copying and search
    // happen on the existing routing worker under its cancellation epoch.
    for (let index = 0; index < queue.length && index < 64; index++) {
        if (cancelled()) return { status: 'cancelled' };
        const { x, y, removed, opened, first, cost } = queue[index];
        const events = meltedEvents(geometry, live.events, ice, removed);
        const world = composeWorld(geometry, { ...live, events }, cancelled);
        if (!world) return { status: 'cancelled' };
        for (const [cell, flags] of terrain) world.cells[cell] = (world.cells[cell] & 240) | flags;
        if (opened) for (const [cell, flags] of control.changes) world.cells[cell] = (world.cells[cell] & 240) | flags;
        if (first) {
            const goal = solveWorldRoute(world, { ...request, x, y, ...(betterThan!==undefined&&{field:false,terminalTransfers:true,removableOnly:true}) }, cancelled);
            if (goal.status === 'cancelled') return goal;
            if ((goal.status === 'ready' || goal.status === 'interrupted') &&
                (betterThan===undefined||cost+goal.distance<betterThan))
                return { ...first, status:['interrupted','controlRoute'].includes(first.status)?first.status:'iceRoute',
                    plannedDistance:cost+(goal.plannedDistance??goal.distance) };
        }
        if (control && !opened) {
            const approach = solveWorldRoute(world, { x, y, event: control.id, field: true }, cancelled);
            if (approach.status === 'cancelled') return approach;
            const planned = approach.status === 'interrupted'
                ? solveWorldRoute(world, { x, y, event: control.id, field: false, terminalTransfers:true,removableOnly:betterThan!==undefined }, cancelled) : approach;
            if (planned.status === 'cancelled') return planned;
            if (planned.status === 'ready') {
                const { x: nextX, y: nextY } = planned.arrival;
                const key = removed + ':true:' + nextX + ':' + nextY;
                if (!visited.has(key) && queue.length < 64) {
                    visited.add(key);
                    queue.push({ x: nextX, y: nextY, removed, opened: true, cost:cost+planned.distance,
                        first: first || { ...approach, event: control.id,
                            status: approach.status === 'interrupted' ? 'interrupted' : 'controlRoute' } });
                }
            }
        }
        for (const [slot, block] of ice.entries()) {
            if (removed & (1 << slot)) continue;
            const approach = solveWorldRoute(world, { x, y, event: block.id, field: true }, cancelled);
            if (approach.status === 'cancelled') return approach;
            if (!['ready','interrupted'].includes(approach.status) || approach.status==='interrupted'&&
                world.events.some(event=>event.id===approach.boundaryEvent&&event.mapTransfer)) continue;
            // Verify physical continuation to this ice on the worker, while
            // retaining the original safe prefix to the earlier floor event.
            // Nothing past that event is sent as immediately walkable.
            const planned = approach.status === 'interrupted' ?
                solveWorldRoute(world,{x,y,event:block.id,field:false,terminalTransfers:true,removableOnly:betterThan!==undefined},cancelled) : approach;
            if (planned.status === 'cancelled') return planned;
            if (planned.status !== 'ready') continue;
            const next = removed | (1 << slot);
            const { x: arrivalX, y: arrivalY } = planned.arrival;
            const key = next + ':' + opened + ':' + arrivalX + ':' + arrivalY;
            if (visited.has(key) || queue.length >= 64) continue;
            visited.add(key);
            queue.push({ x: arrivalX, y: arrivalY, removed: next, opened, cost:cost+planned.distance, first: first || { ...approach, event: block.id } });
        }
    }
    return null;
}

function shorterIceRoute(geometry,live,request,cancelled,distance) {
    if(!Number.isInteger(distance)||distance<2||request.motion||request.area||request.entrances||request.vehicle)return null;
    return routeThroughIce(geometry,live,request,cancelled,[],undefined,distance);
}

function routeThroughTerrain(geometry, live, request, controls, cancelled, remoteAccess) {
    // A known movable NPC can precede a separate melt or button. Prove
    // those later effects only on a copy; the real first action is talking.
    const gate=live.npcPassage;
    if(gate&&request.event!==gate.event&&!remoteAccess&&!request.motion&&!request.area) {
        const events=gate.movesTo?live.events.map(event=>event.id===gate.event?
            {...event,x:gate.movesTo[0],y:gate.movesTo[1]}:event):live.events.filter(event=>!gate.clears.includes(event.id));
        const proof=routeThroughTerrain(geometry,{...live,events,npcPassage:null},request,controls,cancelled);
        if(proof?.status==='cancelled')return proof;
        if(proof&&['iceRoute','controlRoute','interrupted'].includes(proof.status)) {
            const approach=solveRoute(geometry,live,{x:request.x,y:request.y,event:gate.event,field:true},cancelled);
            if(approach.status==='cancelled')return approach;
            if(approach.status==='ready')return {...approach,status:'npcBlocked',npc:gate.event};
        }
    }
    const plan = world => routeThroughControl(geometry, world, request, controls, cancelled) ||
        (!request.refresh && routeThroughIce(geometry, world, request, cancelled));
    const canProject = live.mode === 'walk' && !request.refresh && !request.entrances && !request.vehicle &&
        !request.area && !request.motion && (controls?.length || live.events.some(event => event.meltable && !event.erased));
    const preferProjection = canProject && live.stableEncounters && !remoteAccess;
    const direct = remoteAccess ? routeThroughControl(geometry, live, request, controls, cancelled, remoteAccess)
        : preferProjection ? null : plan(live);
    // A remote bridge/crystal gate is not a prerequisite when a local melt
    // already proves the destination reachable on the unchanged terrain.
    if (direct && ['terrainGate','terrainExit'].includes(direct.status) && canProject && !remoteAccess) {
        const local = routeThroughIce(geometry,live,request,cancelled);
        if (local) return local;
    }
    if (direct || !canProject || cancelled()) return direct;
    // Ice and a moving encounter can block different parts of the same
    // route. Use the relaxed world only to prove continuation. Verify the
    // first step on the unchanged snapshot before giving any instructions.
    const obstacles = new Set(encounterObstacles(live.events, request.event));
    if (!obstacles.size) return preferProjection ? plan(live) : null;
    const candidate = plan({ ...live, events: live.events.filter(event => !obstacles.has(event)) });
    if (candidate?.status === 'cancelled') return candidate;
    if (candidate?.status === 'interrupted') {
        const prefix = solveRoute(geometry,live,{x:request.x,y:request.y,event:candidate.boundaryEvent,
            field:true,stopBeforeEvent:true},cancelled);
        return ['interrupted','enemyBlocked','cancelled'].includes(prefix.status) ? prefix : null;
    }
    if (!candidate || !['controlRoute', 'iceRoute'].includes(candidate.status)) return preferProjection ? plan(live) : null;
    if (candidate.step) {
        const first = solveRoute(geometry, live, { x: request.x, y: request.y, event: candidate.event,
            field: true, stopBeforeEvent: true }, cancelled);
        if (first.status === 'interrupted' && first.boundaryEvent === candidate.event)
            return { ...first, status: 'controlRoute', event: candidate.event, gate: candidate.gate, step: true };
        return first.status === 'cancelled' || first.status === 'enemyBlocked' ? first : null;
    }
    const prefix = solveRoute(geometry, live, { x: request.x, y: request.y, event: candidate.event, field: true }, cancelled);
    if (prefix.status === 'ready') return { ...prefix, status: candidate.status, event: candidate.event, gate: candidate.gate };
    if (prefix.status === 'enemyBlocked') return { ...prefix, terrain: { status: candidate.status, event: candidate.event } };
    return ['interrupted', 'cancelled'].includes(prefix.status) ? prefix : null;
}

// Monotone, reachable native prerequisites for detached graph proofs. The
// real local route still returns the first interaction/event on unchanged
// collision. At most64 effects are consumed; no game objects or code execute.
function prerequisiteLanding(geometry,live,x,y,controls=[],cancelled=()=>false) {
    let events=live.events,terrain=live.terrain instanceof Uint32Array ? Array.from(live.terrain,packed=>{
        const cell=packed&(MAX_CELLS-1);return [cell%geometry.width,Math.floor(cell/geometry.width),packed>>>CELL_BITS];
    }):live.terrain,available;
    const edits=new Map(Array.from(terrain||[],row=>[row[1]*geometry.width+row[0],row[2]]));
    const opened=new Set();let npcOpened=false;
    for(let pass=0;pass<=64;pass++) {
        if(cancelled()) return null;
        available=walkingLanding(geometry,{...live,events,terrain},x,y,cancelled);
        if(!available) return null;
        if(pass===64) return available;
        const floor=events.find(event=>event.clearsOnUse&&!event.erased&&available.events[event.id]);
        if(floor) {events=events.filter(event=>event!==floor);continue;}
        const ice=events.find(event=>event.meltable&&!event.erased&&available.events[event.id]);
        if(ice) {events=meltedEvents(geometry,events,[ice],1);continue;}
        const gate=live.npcPassage;
        if(!npcOpened&&gate&&available.events[gate.event]) {
            npcOpened=true;
            events=gate.movesTo?events.map(event=>event.id===gate.event?{...event,x:gate.movesTo[0],y:gate.movesTo[1]}:event):
                events.filter(event=>!gate.clears.includes(event.id));
            continue;
        }
        const control=controls.find(([id,changes,pull])=>id>0&&!pull&&!opened.has(id)&&available.events[id]&&
            changes.length&&changes.every(([cell,flags])=>(((edits.get(cell)??geometry.cells[cell])&flags&15)===((edits.get(cell)??geometry.cells[cell])&15))));
        if(!control) return available;
        const [id,changes]=control;opened.add(id);
        for(const [cell,flags]of changes)edits.set(cell,((edits.get(cell)??geometry.cells[cell])&240)|flags);
        terrain=Array.from(edits,([cell,flags])=>[cell%geometry.width,Math.floor(cell/geometry.width),flags]);
        const actor=events.find(event=>event.id===id);
        if(actor?.trigger===1&&!actor.normal)events=events.filter(event=>!controls.some(([other])=>other===event.id));
        if(live.terrainSwitch===103)events=events.filter(event=>event.id!==8);
    }
    return available;
}

module.exports = { shorterIceRoute, prerequisiteLanding, routeThroughTerrain, routeThroughControl, routeThroughIce, meltedEvents };
