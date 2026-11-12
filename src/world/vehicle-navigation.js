'use strict';

function surfaceVehicle(map, type) {
    const index = type === 'ship' ? 1 : type === 'boat' ? 0 : -1;
    const vehicle = map?._vehicles?.[index];
    return vehicle?._type === type && vehicle._mapId === map._mapId ? vehicle : null;
}

function travelMode(map, player) {
    const type = player?._vehicleType;
    if (player?._through) return null;
    // MapScene's native forced handback can leave the walking slot empty.
    if (type === 'walk' || type === '') return 'walk';
    if (map?._mapId === 113 && (type === 'ship' || type === 'boat') &&
        surfaceVehicle(map, type)?._driving === true) return type;
    return null;
}

function parkedVehicle(map, type) {
    const vehicle = surfaceVehicle(map, type);
    if (!vehicle || vehicle._driving || vehicle._transparent === true ||
        !Number.isInteger(vehicle._x) || !Number.isInteger(vehicle._y)) return null;
    return vehicle;
}

function aircraftAt(map) {
    const aircraft = map._vehicles?.[2];
    return aircraft?._type === 'airship' && aircraft._mapId === map._mapId && !aircraft._driving &&
        Number.isInteger(aircraft._x) && Number.isInteger(aircraft._y)
        ? { x: aircraft._x, y: aircraft._y } : null;
}

function boardingTargets(map) {
    if (map._mapId !== 113) return [];
    const targets = [];
    for (const [type, id, name] of [['ship', 514, 'Boat'], ['boat', 515, 'Small boat']]) {
        const vehicle = parkedVehicle(map, type);
        if (vehicle) targets.push({ id, x: vehicle._x, y: vehicle._y, name, category: 'vehicles', vehicle: type });
    }
    return targets;
}

module.exports = { surfaceVehicle, travelMode, parkedVehicle, aircraftAt, boardingTargets };
