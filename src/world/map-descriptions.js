'use strict';

// Visual descriptions authored against the installed tile art. Shared text
// represents visibly similar rooms and never exposes unvisited destinations.
const HOUSE = 'A small home with a bed, wooden furniture and a lit doorway. Rugs, shelves and barrels break up the floor.';
const ICE_HOUSE = 'Blue stone walls surround a small furnished room. A warm window lights the bed, shelves and wooden furniture.';
const DESERT_HOUSE = 'Warm ochre flooring and bright walls surround low wooden furniture. Books, barrels and rugs are scattered around the room.';
const COAST_HOUSE = 'Pale blue stone walls enclose a furnished room. A rug and warm pool of light mark the doorway.';
const RESTAURANT = 'A service counter faces small dining tables and a broad red rug with a Wendy’s logo. More tables sit in a row of booths along the right wall.';
const SAUCE = 'Sandy passages circle a broad round basin. Dark channels and colored fixtures divide the paths between tall sandstone walls.';
const FRY_RUINS = 'A grassy clearing rests among low cliffs, flowering trees and worn stone fragments.';
const SNOW_RUINS = 'Snow covers a small clearing edged with blue ice and snow-laden firs. Worn stones and stray ice crystals stand out against the pale ground.';
const DESERT_RUINS = 'Cacti and weathered stones punctuate the yellow sand. The ground drops away at steep brown ledges.';
const ISLAND_RUINS = 'Pale shore and blue water surround a small grassy rise. Palms and flowering plants cluster around the weathered stonework.';
const BLUFF_RUINS = 'Reddish ground is broken up by metal panels, pipes and scraps of machinery.';
const CRYSTAL_CAVE = 'Pale passages wind among violet cave walls and crystal clusters. Dark gaps separate stretches of floor.';
const maps = Object.freeze({
    12: 'Russetwood occupies a green valley ringed by stepped brown cliffs and flowering trees. Yellow paths wind among brightly roofed homes and a central green. A stream and several waterfalls run through the town, with small bridges connecting parts of it.',
    13: 'A chain of pale, sandy beaches stretches through turquoise water. Palm trees, shells and patches of grass interrupt the sand. The eastern shore rises into wooded cliffs with a stairway.',
    14: 'Rectangular beds of dark soil sit among fences and grassy paths. The fields spread across several levels connected by stairs. A stream winds along the lower ground, and pink flowering trees mark the field edges.',
    15: 'Dense yellow-green trees and scattered pink blossoms crowd the French Fry Forest. Narrow golden paths wind around thickets, cliffs and pools. A bridge crosses the stream toward the west side of the forest.',
    16: 'The Crispy Ruins lie along a green headland above a pale beach. Trees shade a winding path across stepped cliffs. Weathered stonework stands in open clearings along the upper paths.',
    17: 'A cave mouth opens at the foot of a brown cliff, above a pale strip of beach. Broken columns, palms and fallen stone line the approach beside turquoise water.',
    19: 'Pale stone paths wind through a violet cavern with tall crystal clusters. Dark gaps split the floor into loops and narrow passages. The tunnels open into larger chambers at several points.',
    20: 'Blue ice cliffs rise behind a snowy shoreline. Thick firs border the open ground, where fallen stone and palms stand near the water.',
    25: 'Snowy Chillcrest is built among blue ice cliffs, fir trees and dark channels. Stairways and crossings join clusters of houses at different heights. A red-roofed building stands out on the lower side of town.',
    26: 'Float Fort lies on a snowy coast backed by stepped ice cliffs and thick firs. A round tower stands in a clearing. A large ship with bright sails moors off the eastern shore.',
    27: 'Snowy terraces rise and fall through banks of firs and blue ice cliffs. Dark pools and channels break up the snow. Stairs connect the narrow paths and broad clearings.',
    28: SAUCE, 32: SAUCE,
    33: CRYSTAL_CAVE, 35: CRYSTAL_CAVE,
    36: 'Cold Brew Trail crosses wooded slopes and blue ice terraces. Stairways punctuate the cliffs, and the terrain opens onto dark pools and wide snowy clearings at higher elevations.',
    37: CRYSTAL_CAVE,
    44: SAUCE,
    45: 'Nuggedor stretches along a long strip of golden sand. Small buildings and bright awnings sit at different heights among winding lanes and brown walls. The cliff edges and steps divide the town into several terraces.',
    48: 'A winding golden path climbs through deep brown sandstone ravines. Stairs and ledges lead past small buildings with brightly colored roofs.',
    49: 'Pale sand curves around turquoise water at Breaded Bay. A ship with vivid sails sits by the western shore. A small building stands on a raised desert terrace to the east.',
    50: SAUCE,
    51: 'A torchlit sandstone room is split by a dark channel. Earthen jars line the walls, and bright fixtures stand at the back.',
    52: 'A long sandstone passage runs between high, dark cliffs. Ledges, stairs and colored fixtures interrupt the route through the ravine.',
    53: 'The sandstone room bends around a dark channel. Rows of jars and bright fixtures stand on the pale floor.',
    55: 'A dark channel winds through a torchlit chamber. Bright fixtures and rounded stones sit on both sides of it.',
    57: 'An enormous round pot-shaped building dominates a sandy approach. Narrow stone paths wind among low cliffs and brightly colored fixtures.',
    58: 'An enormous round pot-shaped building dominates a sandy approach. Narrow stone paths wind among low cliffs and brightly colored fixtures.',
    59: 'Nuggedor stretches along a long strip of golden sand. Buildings, sunken lanes and brown walls divide the town into terraces.',
    60: 'Palms and bright desert plants ring a blue pool. Shallow water winds around a small central island with a bright-roofed building.',
    61: 'A yellow path winds above a long dark cliff. A staircase leads up from the lower sandy clearing, where cacti and stones dot the ground.',
    62: 'Rocky terraces rise around bright orange flows. Stairs and narrow stretches of sand skirt channels and a glowing drop between the cliffs.',
    63: 'A sandy chamber is laid out around a broad circular platform. Colored fixtures line the walls on both sides of a central approach.',
    66: 'A small palm-covered island rises above turquoise water. Two stairways climb its pale cliff to a grassy upper clearing.',
    76: 'Sunrise Bay spreads across pale islands and low cliffs amid turquoise water. Short bridges join the lanes between buildings, palms and grassy terraces. Small waterfront paths wind around the edge of town.',
    77: 'A chain of pale stepping islands leads to a broader wooded shore. Short bridges cross the channels, and a grassy clearing opens among the palms.',
    78: 'Shellside lies on a narrow pale island dotted with palms. Tall blue-white cliffs rise over the shore, with a dark opening at their base.',
    79: 'Pale beaches curl around a lagoon in Devilled Nook. Palms stand on small stretches of sand below a raised cliff.',
    80: 'Dense palms crowd the grassy terraces above pale beaches. Water cuts into the land, and blue-white cliffs divide the larger clearings.',
    81: 'A broad cliff face rises above Scrambled Shores. Low palms, pale sand and turquoise channels surround it. Dark openings punctuate the rock.',
    84: 'Small pale islands and blue-white cliffs lie in open water. Palms and patches of greenery dot the shores, and low crossings lead between them.',
    85: 'Turquoise channels divide rocky islands with palms and pale shores. Dense greenery covers the largest terrace, and the cliffs rise above dark openings.',
    86: 'Several small islands form a north-south chain. Wooden bridges link pale trails between palms, and a large circular platform occupies the northern clearing.',
    87: 'Caffeine Caverns has a broad tangle of warm brown rock and pale violet ledges. Narrow passages loop around large dark gaps. Stairways and wider chambers punctuate the winding routes.',
    93: 'Patty Pit is a long ravine crowded with industrial debris. Bright red-orange runoff winds between terraces, metal slabs and pipes.',
    94: 'Burgenburg spreads over reddish industrial ground. Bright runoff cuts through the settlement between pipes and metal structures. Small buildings and round platforms stand against dark terraced slopes.',
    97: 'A broad gray fortress overlooks an approach littered with metal panels and pipes. Large yellow M emblems and the barred gate mark the building.',
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
    149: 'Wooden display benches and baskets line the walls of a small shop. A table stands on a dark rug in the middle.',
    150: 'A long wooden counter divides a small room. A candle lights the counter, with cabinets along the back wall.',
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
    209: 'A dark cave opening cuts into the pale cliff above a sandy trail. Palms and a wide grassy patch mark the shore.'
});

const regions = Object.freeze({
    16: 'Fryshire fills the southwest of Savoria with green forests and cliffs surrounding winding paths. Pale beaches line the coast, and Russetwood sits inland.',
    17: 'The Chilly North fills the northwest with snowy woods and blue cliffs. A port lies along the northern shore and the snow thins toward the south.',
    18: 'Nugget Sands lies to the northeast, with broad golden terraces and darker ravines. Buildings and bright patches of vegetation break up the desert, and a port lies on the northern shore.',
    19: 'The Breakfast Isles form a southeast chain of pale islands. Bridges and narrow crossings connect grassy rises over a network of turquoise channels.',
    20: 'The Beef Bluffs rise near the middle of Savoria. Reddish cliffs surround a large gray industrial complex.',
});
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
    if (id !== 113) return maps[id] || '';
    const player = root.$gamePlayer;
    return worldDescription(root.$dataMap, player?._x, player?._y);
}

module.exports = { mapDescription };
