'use strict';

// Visual descriptions authored against the installed tile art. Shared text
// represents visibly similar rooms and never exposes unvisited destinations.
const HOUSE = 'A small home with a bed, wooden furniture and a lit doorway. Rugs, shelves and barrels break up the floor.';
const ICE_HOUSE = 'Blue stone walls surround a small furnished room. A warm window lights the bed, shelves and wooden furniture.';
const DESERT_HOUSE = 'Warm ochre flooring and bright walls surround low wooden furniture. Books, barrels and rugs are scattered around the room.';
const COAST_HOUSE = 'Pale blue stone walls enclose a furnished room. A rug and warm pool of light mark the doorway.';
const RESTAURANT = 'A service counter faces small dining tables and a broad red rug with a Wendy’s logo. More tables sit in a row of booths along the right wall.';
const SAUCE = 'Sandy passages circle a basin of orange sauce. Narrow channels weave past boulders shaped like chicken nuggets and brightly colored dipping-sauce tubs. Empty channels are dark, and filled ones glow orange.';
const FRY_RUINS = 'A grassy clearing rests among low cliffs, flowering trees and worn stone fragments.';
const SNOW_RUINS = 'Snow covers a small clearing edged with blue ice and snow-laden firs. Worn stones and stray ice crystals stand out against the pale ground.';
const DESERT_RUINS = 'Cacti and weathered stones punctuate the yellow sand. The ground drops away at steep brown ledges.';
const ISLAND_RUINS = 'Pale shore and blue water surround a small grassy rise. Palms and flowering plants cluster around the weathered stonework.';
const BLUFF_RUINS = 'Reddish ground is broken up by metal panels, pipes and scraps of machinery.';
const CRYSTAL_CAVE = 'Pale passages wind among violet cave walls and crystal clusters. Dark gaps separate stretches of floor.';
const maps = Object.freeze({
    12: 'Russetwood fills a green valley beneath stepped brown cliffs and pink flowering trees. Some houses are shaped like potatoes, with round windows and little doors. A Wendy’s with red awnings stands on the west side. Waterfalls feed a stream that loops around a grassy island, where a potato tipped on its side spills fries. Bridges and broad yellow stairs connect the paths.',
    13: 'Pale beaches and sandbars wind through turquoise shallows. Palms, shells and giant salt shakers dot the shore. The eastern beach rises toward grassy cliffs and a staircase.',
    14: 'Rows of potato plants fill fenced beds of dark soil on stepped terraces. Oversized potatoes spill fries beside the fields and along the cliffs. A stream winds below the beds, and broad yellow stairs link the paths.',
    15: 'Dense green trees with pink blossoms crowd the French Fry Forest. Golden trails and wooden footbridges wind around a stream below the cliffs. Loose fries lie among the trees, and a tipped fryer basket with a bright pink handle sits in a pool to the southeast.',
    16: 'The Crispy Ruins lie on a green headland over a pale beach. Worn stone rings and fragments stand among stepped cliffs and pink flowering trees. Huge potatoes jut from the cliff faces, and one spills fries beside a path.',
    17: 'A cave mouth opens at the foot of a brown cliff above a pale beach. Huge glass salt shakers stand on the sand beside palms and turquoise water.',
    19: 'Pale, crystalline paths wind through violet caverns and dark gaps. Giant salt shakers stand beside some of the pools and branching tunnels. Lighting the torches gradually brings pools of warm light to the passages.',
    20: 'Bright blue ice cliffs rise above a pale lavender beach with giant salt shakers. The trees on the ledges have layered white tops like swirls of soft serve. A few small palms grow by the turquoise water.',
    25: 'Chillcrest is built into bright blue ice-cream terraces. Frosted firs and dark blue channels lined with ice chunks divide the town. Several houses are blue towers topped with swirls of soft serve. Frostyna’s large blue house sits on a northwest ledge, with spiral decorations around the door. Elder Frosty’s tower stands above two broad flights of blue steps near the center. The red-roofed Wendy’s anchors the lower town. A pale beach and floating ice border the east shore.',
    26: 'Float Fort sits between frosted firs on blue ice terraces and a pale lavender beach. A round blue tower topped with a swirl of soft serve stands in a clearing. A wooden dock reaches into turquoise water to a large ship with bright pink sails.',
    27: 'Frosty Peak rises in bright blue ice terraces among dense firs with white, soft-serve-shaped tops. Dark channels and scattered ice blocks divide the clear ground. Broad blue stairs connect narrow paths and open ledges.',
    28: SAUCE, 32: SAUCE,
    33: CRYSTAL_CAVE, 35: CRYSTAL_CAVE,
    36: 'Cold Brew Trail climbs through thick clusters of frosted firs. The clearings have snow-white ground with patches of tan, and glossy blue ice cliffs rise between levels. Oversized fries jut from the ground, and a pink spoon holds a dollop of soft serve in a lower clearing. Yellow ladders and a broad blue stairway climb the cliffs near a dark channel dotted with ice.',
    37: CRYSTAL_CAVE,
    44: SAUCE,
    45: 'Nuggedor stretches along golden sand and deep brown terraces. Chicken nugget boulders dot the slopes, and carts loaded with nuggets stand along the tracks. Houses look like bright takeout cartons with white lids. A sandstone arch stands in a western hollow, and a red-roofed Wendy’s occupies the northeast terrace.',
    48: 'Tracks and ladders wind around deep sandstone ravines. Oversized chicken nuggets lie on the ledges beside brightly colored dipping-sauce tubs. Narrow paths connect the mine’s levels beside orange flows.',
    49: 'Pale sand curves around turquoise water at Breaded Bay. A ship with bright sails is moored to the west. A giant salt shaker stands near the beach, and a takeout-carton house and oversized chicken nuggets occupy the raised desert terrace.',
    50: SAUCE,
    51: 'A deep channel splits a small torchlit sandstone room. Rows of earthen jars and brightly colored dipping-sauce tubs line the edges.',
    52: 'Chicken nugget boulders cover the ledges of a long mine passage. Orange flows, dark cliffs and colorful dipping-sauce tubs mark the sandy track, which climbs through tall sandstone walls.',
    53: 'The sandstone room bends around a dark channel. Earthen jars and dipping-sauce tubs dot the floor, and an oversized nugget sits near the edge.',
    55: 'A winding channel divides this torchlit chamber. Dipping-sauce tubs with bright lids and nugget-shaped boulders stand on either side.',
    57: 'An enormous pot with a scoop set into its top dominates the sandy approach. Orange sauce channels, nugget boulders and brightly colored dipping-sauce tubs break up the paths below the cliffs.',
    58: 'An enormous pot with a scoop set into its top dominates the sandy approach. Orange sauce channels, nugget boulders and brightly colored dipping-sauce tubs break up the paths below the cliffs.',
    59: 'Nuggedor occupies a long strip of golden sand and dark terraces. Houses look like takeout cartons with bright lids. Chicken nugget boulders and mine tracks flank the sunken paths, and a red-roofed Wendy’s stands on the raised northeast side.',
    60: 'Palms and bright desert plants ring a blue pool. Shallow water winds around a small central island with a bright-roofed building.',
    61: 'A yellow path winds above a long dark cliff. A staircase leads up from the lower sandy clearing, where cacti and stones dot the ground.',
    62: 'Orange flows wind between rocky terraces. Oversized chicken nuggets and colorful dipping-sauce tubs sit on the ledges. Stairs and thin stretches of sand skirt the channels and the glowing drop between the cliffs.',
    63: 'A sandy passage winds around a central platform ringed with orange sauce. Bright dipping-sauce tubs line the walls, and a sandstone stairway rises at the far end.',
    66: 'Pale cliffs rise from turquoise water at Benedict’s Bight. Two yellow ladders climb past giant salt shakers toward a flat top dotted with palms and flowers.',
    76: 'Bacon bridges link the pale islands of Sunrise Bay. Houses resemble cracked eggs in colorful stands or big coffee mugs with gold roofs. One tipped mug spills coffee into a clearing among the palms. The red-roofed Wendy’s stands toward the north.',
    77: 'Pale stepping islands lead toward a broader shore shaded by palms. A tipped green coffee mug spills across a clearing. Shells and a giant salt shaker dot the pale beaches.',
    78: 'Shellside lies on a narrow pale island dotted with palms. Tall blue-white cliffs rise over the shore, with a dark opening at their base.',
    79: 'Pale beaches curl around a lagoon in Devilled Nook. Umbrellas and palms stand beside the trails, and a cave opens in the raised cliff to the south.',
    80: 'Dense palms crowd the terraces above pale beaches. A giant purple coffee mug lies on its side in a western clearing, with a brown spill spreading from its rim. Blue-white cliffs and turquoise channels divide the islands.',
    81: 'A broad cliff face with dark cave mouths rises over Scrambled Shores. A coffee-mug house with a gold roof sits on the southern shore among palms and beach umbrellas.',
    84: 'Pale beaches and blue-white cliffs rise out of the water at Quiche Coast. Beach umbrellas line the smaller island, and a dark cave opens below the palms on the larger one.',
    85: 'Turquoise channels separate steep little islands at Bacon Beach. Dark cave mouths cut into the pale cliffs. A coffee-mug house with a gold roof sits among palms on the northeast shore.',
    86: 'Wide strips of bacon bridge a north-south chain of pale islands. A giant glass salt shaker stands beside the middle trail. Palms frame a circular stone platform in the northern clearing.',
    87: 'Caffeine Caverns winds past violet ledges and dark gaps. Low rows of golden toast form mazes across the floor. Giant coffee pots stand upright or lie tipped on their sides, and coffee spills onto some of the toast.',
    93: 'Patty Pit is a long ravine littered with machinery, hamburger patties and split buns. Red and orange sauce flows between terraces. Pickle slices, metal slabs and pipes dot the ledges above it.',
    94: 'Burgenburg spreads over reddish terraces strewn with burger patties, split buns and pickle slices. Red and orange sauce channels weave past metal panels and pipes. Round bun-topped buildings line the paths, and a Wendy’s stands high on the north side near a tall gray structure.',
    97: 'A broad gray fortress with barred gates and yellow M emblems overlooks an industrial approach. Hamburger patties, bun halves and pickle slices lie among metal panels and pipes below its walls.',
    98: 'Two banks of stacked metal walls frame a narrow reddish ravine. The path runs down the middle beside rocks and machinery.',
    103: 'A long gray corridor opens into wider halls. Metal blocks and pipes flank the walk, with yellow hazard stripes and a large M at the far end.',
    104: 'Metal work areas branch from a long factory corridor. Square work bays, round platforms and heavy piping fill the workshop.',
    105: 'A machine-filled workshop opens into a narrower corridor leading to a separate northern room. Pipes, hazard stripes and rows of equipment line the factory floor.',
    106: 'Rows of barred cells and heavy doors line two wings of a gray corridor. Thick cables and pipes trace the floor and walls.',
    107: 'A circular platform dominates a gray industrial arena. Pipes, hazard stripes and tall metal partitions enclose the floor.',
    116: 'A round window and a fireplace light a compact wooden home. A table sits on the left, a bed on the right, and a bookcase stands against the back wall.',
    117: 'A wooden entry hall opens into separate rooms with rugs and tables. A long bench sits along the back wall and stairs rise at the upper right.',
    118: 'Two furnished rooms share the upper floor. Wooden beds, cupboards and rugs fill the rooms, and the stairs are at the lower right.',
    119: 'Blue walls frame a warm fireplace and wooden shelves. A bed occupies an upper nook, and a dining table sits at the lower left.',
    120: 'The wooden workshop has long benches, cupboards and scattered tools. Stairs rise in the upper right beyond the worktables.',
    121: 'A long bench and shelves fill the upper half of this wooden house. A writing desk and a pink bed sit across the entry hall.',
    122: 'The upper workshop has round windows and tall cupboards. Tools and small stools are spaced around the wooden floor, above the stairs.',
    123: 'A small bedroom opens onto a wider living room. A fireplace and several bookcases line the right wall.',
    124: 'Two round windows light a wooden room with a fireplace and a central dining table. A bed and drawers line the left wall.',
    125: 'Two blue beds sit along the back wall near a round window. A fireplace and table occupy opposite sides of the wooden room.',
    126: 'Rows of bookcases divide a blue-walled room into short aisles. A staircase rises beyond the shelves.',
    127: 'A blue-walled sitting room has a fireplace and a dining table. Two stairways connect this floor to the levels above and below.',
    128: 'A dining table stands in the center of a small room. A bed sits in an alcove beneath a bright rear window.',
    129: ICE_HOUSE, 130: ICE_HOUSE, 131: ICE_HOUSE,
    132: 'A fireplace warms a blue-walled dining room. A large table occupies the middle, and a staircase rises near the far wall.',
    133: 'Beds occupy one side of the blue-walled upper floor. Shelves and a table line the other side near the stairs.',
    134: 'A small tiled room is surrounded by large pipes and a metal grille. An overhead light illuminates the empty floor.',
    135: DESERT_HOUSE, 136: DESERT_HOUSE, 137: DESERT_HOUSE, 138: DESERT_HOUSE, 139: DESERT_HOUSE,
    140: HOUSE, 141: DESERT_HOUSE, 142: HOUSE, 143: DESERT_HOUSE, 144: HOUSE, 145: DESERT_HOUSE,
    146: COAST_HOUSE, 147: COAST_HOUSE, 148: COAST_HOUSE,
    149: 'Wooden benches and bins of clothing line the coffee mud-bath business. A table stands on a dark rug in the middle.',
    150: "A long wooden counter divides Helly's Surf Shop. A candle lights the counter, with cabinets along the back wall.",
    151: 'Cabinets, books and a counter fill a compact shop. Barrels and a bright rug occupy the front.',
    152: COAST_HOUSE, 153: COAST_HOUSE, 154: DESERT_HOUSE, 155: DESERT_HOUSE, 156: DESERT_HOUSE,
    157: 'A winding hall links several furnished rooms with blue stone walls. A fireplace lights the far room, and stairs rise on the opposite side.',
    158: 'A long upper hall links bedrooms furnished with shelves, barrels and small tables. Bright windows light the north wall.',
    159: 'Stacked barrels and a broad cupboard fill a sparse room. A square window lights the far wall.',
    160: 'Shelves, a writing desk and rows of barrels line a spare room. A red rug sits by the door.',
    161: FRY_RUINS, 162: FRY_RUINS, 164: FRY_RUINS, 165: FRY_RUINS, 166: FRY_RUINS,
    167: SNOW_RUINS, 168: SNOW_RUINS, 169: SNOW_RUINS, 170: SNOW_RUINS, 171: SNOW_RUINS,
    172: DESERT_RUINS, 173: DESERT_RUINS, 174: DESERT_RUINS, 175: DESERT_RUINS,
    176: ISLAND_RUINS, 177: ISLAND_RUINS, 178: ISLAND_RUINS, 179: BLUFF_RUINS, 180: BLUFF_RUINS,
    181: RESTAURANT, 182: RESTAURANT, 183: RESTAURANT, 184: RESTAURANT, 186: RESTAURANT,
    191: 'Pale cliffs split Cracked Cove into small islands and a larger palm-covered shore. Blue water curls between the coves and cliffs. Short stairs climb from the beaches to the grassy tops.',
    193: 'A reddish industrial bluff overlooks an elevator shaft. Pipes, caution signs and metal panels surround the landing.',
    195: 'A small blue-walled bedroom opens around a central dining table. A bright window, green plants and wooden furniture frame the room.',
    196: CRYSTAL_CAVE,
    197: 'Deep red rugs lead toward a statue at the center of a candlelit hall. A raised alcove and symmetrical rows of fixtures frame the ceremonial floor.',
    199: CRYSTAL_CAVE, 200: CRYSTAL_CAVE, 201: CRYSTAL_CAVE, 202: CRYSTAL_CAVE,
    203: ICE_HOUSE, 204: CRYSTAL_CAVE, 205: CRYSTAL_CAVE, 206: ISLAND_RUINS,
    207: FRY_RUINS, 208: FRY_RUINS,
    209: 'A dark cave opens at the foot of a pale cliff above a sandy trail. Palms surround a grassy patch with a tipped coffee mug and its broad brown spill.'
});

const regions = Object.freeze({
    16: 'Fryshire fills the southwest of Savoria with green forests and cliffs surrounding winding paths. Pale beaches line the coast, and Russetwood sits inland.',
    17: 'The Chilly North fills the northwest with snowy woods and blue cliffs. A port lies along the northern shore and the snow thins toward the south.',
    18: 'Nugget Sands lies to the northeast, with broad golden terraces and darker ravines. Buildings and bright patches of vegetation break up the desert, and a port lies on the northern shore.',
    19: 'The Breakfast Isles form a southeast chain of pale islands. Turquoise channels separate the palm-covered shores, where bacon bridges join some of the islands.',
    20: 'The Beef Bluffs rise near the middle of Savoria. Reddish cliffs surround a large gray industrial complex.',
});
// These layer-three cells hold the center of an intact bacon strip
// after the native repair pages write their tiles. Read current artwork.
const BACON_BRIDGE_TILES = {
    77: [21, 10, 13], 79: [17, 7, 37], 80: [18, 9, 13],
    81: [4, 8, 37], 84: [13, 6, 13], 85: [19, 6, 13]
};
const ocean = 'Turquoise water separates Savoria’s landmasses. Snow lies to the northwest, desert to the northeast, green hills to the southwest and a chain of islands to the southeast. A reddish island with a gray fortress lies near the center.';

function worldDescription(map, x, y) {
    if (map?.width !== 54 || map.height !== 44 || !Number.isInteger(x) || !Number.isInteger(y) ||
        x < 0 || x >= 54 || y < 0 || y >= 44) return ocean;
    // These five base terrain families cover the visible land masses.
    // Look for the nearest inland tile when standing on a beach or bridge.
    let nearest = 26;
    let region;
    for (let dy = -5; dy <= 5; dy++) {
        if (y + dy < 0 || y + dy >= 44) continue;
        for (let dx = -5; dx <= 5; dx++) {
            if (x + dx < 0 || x + dx >= 54) continue;
            const distance = dx * dx + dy * dy;
            if (distance >= nearest) continue;
            const kind = Math.floor((map.data?.[(y + dy) * 54 + x + dx] - 2048) / 48);
            if (kind < 16 || kind > 20 || !Number.isInteger(kind)) continue;
            region = kind;
            nearest = distance;
        }
    }
    return regions[region] || ocean;
}

function mapDescription(root) {
    const id = root.$gameMap?._mapId;
    if (id !== 113) {
        const description = maps[id] || '';
        if (!description) return '';
        const map = root.$dataMap;
        const bridge = BACON_BRIDGE_TILES[id];
        if (bridge && root.$gameMap._tilesetId === 13 && map?.data) {
            const [x, y, tile] = bridge;
            const actual = map.data[3 * map.width * map.height + y * map.width + x];
            if (Number.isInteger(actual)) return description + (actual === tile
                ? ' Broad strips of bacon bridge the shallow channels.'
                : ' Broken bacon bridges end in ragged strips at the water’s edge.');
        }
        if (map?.tilesetId !== 7) return description;
        // The Fryshire outdoor maps swap their wet tile art for a dry variant.
        if (root.$gameMap._tilesetId === 11)
            return description + ' Sunlight brightens the dry paths and grass.';
        if (root.$gameMap._tilesetId === 7 && root.$gameScreen?.weatherType?.() === 'rain')
            return description + ' Rain darkens the ground, and puddles catch the light along the paths.';
        return description;
    }
    const player = root.$gamePlayer;
    return worldDescription(root.$dataMap, player?._x, player?._y);
}

module.exports = { mapDescription };
