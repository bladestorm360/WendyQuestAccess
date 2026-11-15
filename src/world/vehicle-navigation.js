'use strict';

const VEHICLES = { ship: { index: 1, id: 514, name: 'Boat' }, boat: { index: 0, id: 515, name: 'Small boat' },
    airship: { index: 2, id: 516, name: 'Airship' } };

function vehicleOnMap(map, type) {
    const vehicle = map?._vehicles?.[VEHICLES[type]?.index];
    return vehicle?._type === type && vehicle._mapId === map._mapId ? vehicle : null;
}

function travelMode(map, player) {
    const type = player?._vehicleType;
    if (type === 'airship') {
        const aircraft = vehicleOnMap(map, type);
        return map?._mapId === 113 && player._through === true && aircraft?._driving === true &&
            aircraft.isHighest?.() === true ? type : null;
    }
    if (player?._through) return null;
    // MapScene's native forced handback can leave the walking slot empty.
    if (type === 'walk' || type === '') return 'walk';
    if (map?._mapId === 113 && (type === 'ship' || type === 'boat') &&
        vehicleOnMap(map, type)?._driving === true) return type;
    return null;
}

function parkedVehicle(map, type) {
    const vehicle = vehicleOnMap(map, type);
    if (!vehicle || vehicle._driving || vehicle._transparent === true ||
        !Number.isInteger(vehicle._x) || !Number.isInteger(vehicle._y) ||
        (type === 'airship' && vehicle.isLowest?.() !== true)) return null;
    return vehicle;
}

function aircraftAt(map) {
    const aircraft = vehicleOnMap(map, 'airship');
    return aircraft && !aircraft._driving &&
        Number.isInteger(aircraft._x) && Number.isInteger(aircraft._y)
        ? { x: aircraft._x, y: aircraft._y } : null;
}

function boardingTargets(map) {
    if (map._mapId !== 113) return [];
    const targets = [];
    for (const [type, { id, name }] of Object.entries(VEHICLES)) {
        const vehicle = parkedVehicle(map, type);
        if (vehicle) targets.push({ id, x: vehicle._x, y: vehicle._y, name, category: 'vehicles', vehicle: type });
    }
    return targets;
}

function canLand(map, x, y) {
    return vehicleOnMap(map, 'airship')?.isLandOk?.(x, y, 2) === true;
}

const TRAVEL_SPEECH = { walk: 'On foot.', boat: 'On small boat.', ship: 'On boat.', airship: 'On airship.' };

function createVehicleNotice(root, host, ready, notifications, append = () => false) {
    const modes = new WeakMap();
    let pending = null;
    let output = null;

    function discard(state) {
        pending = null;
        state.renderer.off('postrender', state.present);
    }

    function leave(scene) {
        if (!scene) return;
        scene._wqaLandingDue = undefined;
        if (pending?.scene === scene) discard(pending);
        if (output?.scene === scene) {
            notifications.close(output.token);
            output = null;
        }
        scene._wqaVehicleNotice = false;
    }

    function observe(scene) {
        if (pending?.scene === scene || !ready(scene, true)) return;
        const renderer = host.graphics.app?.renderer;
        const player = root.$gamePlayer;
        const map = root.$gameMap;
        const mode = travelMode(map, player);
        if (!mode || !renderer) return;
        const type = player._vehicleType;
        const changed = scene._wqaVehicleType !== type;
        const x = player._x;
        const y = player._y;
        const settled = () => player._x === x && player._y === y &&
            player._realX === x && player._realY === y;
        const sample = mode === 'airship' && settled() && (scene._wqaLandingX !== x ||
            scene._wqaLandingY !== y || !(host.graphics.frameCount < scene._wqaLandingDue));
        if (!changed && !sample) return;
        if (pending) leave(pending.scene);
        if (output && output.scene !== scene) leave(output.scene);

        const valid = () => ready(scene, true) && root.$gamePlayer === player &&
            root.$gameMap === map && player._vehicleType === type && travelMode(map, player) === mode;
        function finish() {
            if (pending !== state) return;
            discard(state);
            scene._wqaVehicleNotice = output?.scene === scene;
            if (!valid()) return;
            scene._wqaVehicleType = type;
            const previous = modes.get(player);
            const sameFlight = previous?.mode === 'airship' && previous.map === map;
            let landable = mode === 'airship' && sameFlight && previous.landable;
            let landing = null;

            // The engine checks both terrain and event occupancy. Resample
            // a stationary tile occasionally because an event can move.
            if (sample && settled() && ready(scene)) {
                const allowed = canLand(map, x, y);
                if (allowed && !landable) landing = { kind: 'fieldStatus', name: 'Can land.' };
                landable = allowed;
                scene._wqaLandingX = x;
                scene._wqaLandingY = y;
                scene._wqaLandingDue = host.graphics.frameCount + 15;
            }
            if (mode !== 'airship') scene._wqaLandingDue = undefined;
            modes.set(player, { mode, map, landable });

            const travel = previous?.mode !== mode && (previous || mode !== 'walk')
                ? { kind: 'fieldStatus', name: TRAVEL_SPEECH[mode] } : null;
            if (!travel && !landing) return;
            const first = travel || landing;
            if (append(scene, first)) {
                if (travel && landing) append(scene, landing);
                return;
            }
            const speech = output = { scene, token: 0 };
            speech.token = notifications.open(first, () => output === speech && valid(), true);
            if (!speech.token) output = null;
            scene._wqaVehicleNotice = !!output;
            if (speech.token && travel && landing)
                notifications.focus(speech.token, { ...landing, append: true });
        }
        const state = { scene, renderer, present() {
            if (!valid()) return leave(scene);
            // Join a map or quest announcement from the same render.
            host.schedule(finish);
        } };
        pending = state;
        scene._wqaVehicleNotice = true;
        scene._wqaPresentation = true;
        renderer.once('postrender', state.present);
    }

    return { observe, leave };
}

module.exports = { vehicleOnMap, travelMode, parkedVehicle, aircraftAt, boardingTargets, canLand, createVehicleNotice };
