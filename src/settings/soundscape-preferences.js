'use strict';

const SOUNDSCAPE = Object.freeze({
    person: { label: 'People and merchants', previews: [['Person', 'entityPerson']] },
    exit: { label: 'Exits', previews: [['Exit', 'entityExit'], ['Door', 'entityDoor'], ['Stairs', 'entityStairs']] },
    treasure: { label: 'Treasure', previews: [['Treasure', 'entityTreasure']] },
    object: { label: 'Interactible objects', previews: [['Object', 'entityObject']] },
    checkpoint: { label: 'Checkpoints', previews: [['Checkpoint', 'entityCheckpoint']] }
});

function volume(value, fallback) {
    return Number.isInteger(value) && value >= 0 && value <= 100 ? value : fallback;
}

function normalizeSoundscape(value) {
    const categories = {};
    for (const category of Object.keys(SOUNDSCAPE)) {
        const saved = value?.categories?.[category];
        categories[category] = { enabled: saved?.enabled !== false, volume: volume(saved?.volume, 100) };
    }
    return { enabled: value?.enabled === true, volume: volume(value?.volume, 45), categories };
}

module.exports = { SOUNDSCAPE, normalizeSoundscape };
