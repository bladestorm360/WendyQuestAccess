'use strict';

// Run via the shared bounded runner. Derived map geometry is local to the
// supported installation and must stay outside the source tree and payload.
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { bakeMap, encodeMap, CELL_BITS } = require('../src/world/geometry.cjs');
const { MAX_CATALOG_BYTES } = require('../src/world/walking-catalog.cjs');
const { transferMap, bakeCatalog } = require('./transfer-catalog.cjs');
const { bakeControls } = require('./bake-controls.cjs');
const { bakeSalt } = require('./bake-salt.cjs');
const { BREAKFAST_MAPS } = require('../src/world/terrain-control-labels.cjs');
const { breakfastSource, bakeBreakfast } = require('./bake-breakfast.cjs');

const BUILD = '26578620';
const ROOT = path.resolve(__dirname, '..');

function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function inside(parent, child) {
    const relative = path.relative(parent, child);
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function read(file, limit) {
    if (fs.statSync(file).size > limit) throw new Error('Map input exceeds the supported size');
    return fs.readFileSync(file);
}

function bake(installed, destination) {
    const game = fs.realpathSync(installed);
    const output = path.join(fs.realpathSync(path.dirname(path.resolve(destination))), path.basename(path.resolve(destination)));
    if (inside(ROOT, output) || inside(game, output)) throw new Error('Use a new output directory outside Git and Steam');
    for (let cursor = path.dirname(output); cursor !== path.dirname(cursor); cursor = path.dirname(cursor)) {
        if (fs.existsSync(path.join(cursor, '.git'))) throw new Error('Map geometry output belongs outside Git');
    }
    const steamapps = path.resolve(game, '..', '..');
    const app = read(path.join(steamapps, 'appmanifest_3339970.acf'), 65536).toString('utf8');
    if (!new RegExp(`"buildid"\\s+"${BUILD}"`).test(app)) throw new Error('Unsupported Steam build');
    const data = path.join(game, 'package.nw', 'data');
    const tilesetsBytes = read(path.join(data, 'Tilesets.json'), 2 * 1024 * 1024);
    const tilesets = JSON.parse(tilesetsBytes);
    const commonBytes = read(path.join(data, 'CommonEvents.json'), 2 * 1024 * 1024);
    const mapInfosBytes = read(path.join(data, 'MapInfos.json'), 128 * 1024);
    const common = JSON.parse(commonBytes);
    const maps = JSON.parse(mapInfosBytes).filter(Boolean);
    if (maps.length !== 239 || new Set(maps.map(map => map.id)).size !== maps.length) throw new Error('Unexpected map catalog');
    fs.mkdirSync(output);
    const manifest = { build: BUILD, tilesets: digest(tilesetsBytes), commonEvents: digest(commonBytes),
        mapInfos: digest(mapInfosBytes), maps: {} };
    const transferMaps = new Map();
    const breakfast = new Map();
    let cells = 0;
    for (const { id } of maps) {
        if (!Number.isInteger(id) || id < 1 || id > 999) throw new Error('Invalid map identifier');
        const source = read(path.join(data, `Map${String(id).padStart(3, '0')}.json`), 2 * 1024 * 1024);
        const map = JSON.parse(source);
        const flags = tilesets[map.tilesetId]?.flags;
        const geometry = bakeMap(map, flags);
        const binary = encodeMap(id, geometry);
        fs.writeFileSync(path.join(output, `${id}.wqg`), binary, { flag: 'wx' });
        const entry = manifest.maps[id] = { input: digest(source), geometry: digest(binary), width: geometry.width,
            height: geometry.height, tileset: map.tilesetId };
        // Derive only variants the native map script can select. Keep the
        // differences in the existing local map index for worker-only use.
        const variants = new Set();
        for (const event of map.events) {
            for (const page of event?.pages || []) {
                for (const command of page.list) {
                    if (command.code === 282 && command.parameters[0] !== map.tilesetId)
                        variants.add(command.parameters[0]);
                }
            }
        }
        if (id === 19) entry.salt = bakeSalt(map, flags);
        const controls = bakeControls(id, map, flags);
        if (controls) entry.controls = controls;
        if (variants.size) {
            entry.variants = {};
            for (const variant of variants) {
                const alternate = bakeMap(map, tilesets[variant]?.flags);
                const changes = [];
                for (let cell = 0; cell < alternate.cells.length; cell++) {
                    if (geometry.cells[cell] !== alternate.cells[cell])
                        changes.push((alternate.cells[cell] << CELL_BITS) | cell);
                }
                entry.variants[variant] = changes;
            }
        }
        const walkingMap = transferMap(id, map, geometry, flags, common);
        transferMaps.set(id, walkingMap);
        if (BREAKFAST_MAPS.includes(id)) breakfast.set(id, breakfastSource(id, walkingMap, map, controls, common));
        cells += geometry.cells.length;
    }
    const catalog = bakeCatalog(transferMaps, manifest.maps);
    const bytes = Buffer.from(JSON.stringify(catalog));
    if (bytes.length > MAX_CATALOG_BYTES) throw Error('Walking catalog exceeds its size limit');
    manifest.walking = { hash: digest(bytes), catalog };
    const region = Buffer.from(JSON.stringify(bakeBreakfast(breakfast, manifest.maps)));
    if (region.length > MAX_CATALOG_BYTES) throw Error('Regional walking catalog exceeds its size limit');
    fs.writeFileSync(path.join(output, 'breakfast.json'), region, { flag: 'wx' });
    manifest.breakfast = digest(region);
    const index = JSON.stringify(manifest);
    if (Buffer.byteLength(index) > 128 * 1024) throw Error('Map geometry manifest exceeds its size limit');
    fs.writeFileSync(path.join(output, 'manifest.json'), index, { flag: 'wx' });
    return { maps: maps.length, cells };
}

if (require.main === module) {
    const [, , installed, output] = process.argv;
    if (!installed || !output) throw new Error('Supply the Steam game root and a new local geometry output directory');
    const result = bake(installed, output);
    console.log(`Baked ${result.maps} local maps, ${result.cells} cells.`);
}

module.exports = { bake };
