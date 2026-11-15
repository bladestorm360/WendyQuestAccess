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
    let current = null;

    function leave(scene) {
        if (!current || current.scene !== scene) return;
        const state = current;
        current = null;
        state.renderer.off('postrender', state.present);
        if (state.token) notifications.close(state.token);
    }

    function observe(scene) {
        if ((current?.scene === scene && !current.token) || !ready(scene, true)) return;
        const renderer = host.graphics.app?.renderer;
        const player = root.$gamePlayer;
        const map = root.$gameMap;
        const mode = travelMode(map, player);
        if (!mode || !renderer || scene._wqaVehicleType === player._vehicleType) return;
        if (current) leave(current.scene);
        const type = player._vehicleType;
        const valid = () => current === state && ready(scene, true) && root.$gamePlayer === player &&
            root.$gameMap === map && player._vehicleType === type && travelMode(map, player) === mode;
        const state = { scene, renderer, token: 0, present() {
            if (!valid()) return leave(scene);
            // Let other announcements settle after this render so a map or
            // quest update cannot immediately replace the vehicle notice.
            host.schedule(() => {
                if (current !== state) return;
                if (!valid()) return leave(scene);
                scene._wqaVehicleType = type;
                const previous = modes.get(player);
                modes.set(player, mode);
                if (previous === mode || !previous && mode === 'walk') return leave(scene);
                scene._wqaPresentation = true;
                const record = { kind: 'fieldStatus', name: TRAVEL_SPEECH[mode] };
                if (append(scene, record)) return leave(scene);
                state.token = notifications.open(record, valid, true);
                if (!state.token) leave(scene);
            });
        } };
        current = state;
        renderer.once('postrender', state.present);
    }

    return { observe, leave };
}

module.exports = { vehicleOnMap, travelMode, parkedVehicle, aircraftAt, boardingTargets, canLand, createVehicleNotice };
