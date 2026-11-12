'use strict';

// Run via the shared bounded runner. Derived map geometry is local to the
// supported installation and must stay outside the source tree and payload.
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { bakeMap, encodeMap } = require('../src/world/geometry.cjs');
const { MAX_CATALOG_BYTES } = require('../src/world/walking-catalog.cjs');
const { transferMap, bakeCatalog } = require('./transfer-catalog.cjs');

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
    const common = JSON.parse(read(path.join(data, 'CommonEvents.json'), 2 * 1024 * 1024));
    const maps = JSON.parse(read(path.join(data, 'MapInfos.json'), 128 * 1024)).filter(Boolean);
    if (maps.length !== 239 || new Set(maps.map(map => map.id)).size !== maps.length) throw new Error('Unexpected map catalog');
    fs.mkdirSync(output);
    const manifest = { build: BUILD, tilesets: digest(tilesetsBytes), maps: {} };
    const transferMaps = new Map();
    let cells = 0;
    for (const { id } of maps) {
        if (!Number.isInteger(id) || id < 1 || id > 999) throw new Error('Invalid map identifier');
        const source = read(path.join(data, `Map${String(id).padStart(3, '0')}.json`), 2 * 1024 * 1024);
        const map = JSON.parse(source);
        const flags = tilesets[map.tilesetId]?.flags;
        const geometry = bakeMap(map, flags);
        const binary = encodeMap(id, geometry);
        fs.writeFileSync(path.join(output, `${id}.wqg`), binary, { flag: 'wx' });
        manifest.maps[id] = { input: digest(source), geometry: digest(binary), width: geometry.width, height: geometry.height };
        transferMaps.set(id, transferMap(id, map, geometry, flags, common));
        cells += geometry.cells.length;
    }
    const catalog = bakeCatalog(transferMaps, manifest.maps);
    const bytes = Buffer.from(JSON.stringify(catalog));
    if (bytes.length > MAX_CATALOG_BYTES) throw Error('Walking catalog exceeds its size limit');
    manifest.walking = { hash: digest(bytes), catalog };
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
