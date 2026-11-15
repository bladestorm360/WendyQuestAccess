'use strict';

// Describe the observed portrait or idle sprite. Each sentence is a separate
// review line so the existing menu speech bounds can carry both form and gear.
const ENEMIES = new Map([
    ["Frydusa", [
        "A squat red fry carton stands on little boots, with tiny gloved hands and narrowed eyes.",
        "Five golden snake heads spill from the top, their fangs pointed in different directions."
    ]],
    ["Frydusa - VAR1", [
        "A bright scarlet carton with small red hands and feet and round, wide-open eyes.",
        "Five snarling snake heads peer out from the thick golden coils filling the opening."
    ]],
    ["Frydusa - VAR2", [
        "A scuffed, dark red carton on little feet, with red hands and a crooked grin.",
        "Five golden snake heads lean over the rim, showing sharp teeth and red tongues."
    ]],
    ["Cacodemon", [
        "A small tan, round-faced archer with a swept golden crest and a red headband.",
        "A pale shoulder cape covers brown clothes, and a short red bow hangs at its side."
    ]],
    ["GoldenArcher", [
        "A broad-shouldered figure encased in gold plate, with a narrow slit in its pointed helmet.",
        "It stands with its knees bent, holding a curved gold bow and a lowered arrow."
    ]],
    ["GoldenArcherVAR1", [
        "A broad figure in black plate with gold shoulders and boots, and a bright orange visor.",
        "It stands in a low stance with a curved gold bow and a lowered arrow."
    ]],
    ["MechFry", [
        "A stocky red robot with gold fries rising from a boxy chest and a narrow grille for a face.",
        "It stands on wide flat feet, with a jagged scoop on one arm and metal fingers on the other."
    ]],
    ["LilSalty", [
        "A squat, icy-blue creature with a round head, dark purple eyes and a jagged mouth.",
        "Long crystalline spikes rise along its back, and its stubby feet end in claws."
    ]],
    ["LilSaltyVar1", [
        "A pale pink, round creature with dark green eyes under pointed brows and a jagged mouth.",
        "Rows of long pink spikes jut from its back, above short legs and clawed feet."
    ]],
    ["SoggySnake", [
        "A smooth golden snake rises from a patch of disturbed soil.",
        "Its thick body curves like an S under a rounded head with a small eye and open grin."
    ]],
    ["Conehead", [
        "A blue mound of dripping sludge with tiny clawed hands and a wide, dark red mouth.",
        "A tall upside-down waffle cone covers its head down to the mouth."
    ]],
    ["Conehead - VAR1", [
        "A broad puddle of pink sludge with little hooked hands and a gaping dark mouth.",
        "An upside-down golden waffle cone covers the upper part of its head."
    ]],
    ["HotSludgeSundae", [
        "A hunched, dripping mass of brown sludge with one large glowing pink eye and a smaller one.",
        "Sharp teeth fill its wide mouth, and thick, drooping arms nearly reach the ground."
    ]],
    ["MechDouble", [
        "Two yellow robots of different heights stand together, with round, hamburger-like helmets.",
        "Dark horizontal visors divide their heads above boxy chests and jointed metal limbs."
    ]],
    ["MechFlurry", [
        "A wide, blue-plated robot with antennae, red eyes and a row of pale teeth below its visor.",
        "It grips a giant spoon bearing a scoop of speckled ice cream."
    ]],
    ["IceCreamMachine", [
        "A broad, pale blue machine with slanted red eyes on a black screen and a slatted grin.",
        "Round shoulder joints lead to long arms with icy claws, and frost pools by its blocky feet."
    ]],
    ["BlandHawk", [
        "A round tan creature with enormous black eyes, small fangs and tiny feet.",
        "Two broad, leathery wings frame its body, with claw-like tips."
    ]],
    ["MechChicken", [
        "A dark metal bird with a red comb, a narrow orange eye and clawed feet.",
        "Long blade-like feathers fan from its back, and orange lights mark its chest and joints."
    ]],
    ["MechNugget", [
        "A battered gold nugget with heavy red eyes peers out of a round gray machine.",
        "Pink clumps ring its face, and the suit has orange hoses, wide feet and two forward barrels."
    ]],
    ["HeatLamp", [
        "A hunched red crawler with a round yellow lamp where its forehead would be.",
        "A wide mouth bristles with thin teeth, and its short legs end in pale claws."
    ]],
    ["HeatLampVAR1", [
        "A squat, charcoal-gray creature with a pale glowing lamp in its oversized head.",
        "Clawed feet support a low body, and long teeth jut from its open mouth."
    ]],
    ["Axoflopl", [
        "A pink axolotl-like creature with a flat, oval head, small eyes and a sharp-toothed grin.",
        "Frilled gills curl around its face, and its slender body ends in a coiled tail."
    ]],
    ["MechMuffin", [
        "A sandwich-shaped machine with a tan bun and red eyes under a metal brow.",
        "Thin jointed legs curl around the body, with two long, scythe-shaped claws raised above it."
    ]],
    ["OrEggAmi", [
        "A pale yellow creature folded into flat layers, with a pointed snout and small blue eyes.",
        "A broad jaw opens between the layers, and loose flaps droop from the sides."
    ]],
    ["Iceburger", [
        "A squat blue burger coated in ice, with lumps and pointed horns along its head.",
        "Red eyes sit over a huge toothed grin, and icy arms end in hooked claws."
    ]],
    ["MechFreezer", [
        "A tall blue freezer with slatted vents and a face set into its front door.",
        "Narrow red eyes and a crooked grin sit between long icy claws hanging from either side."
    ]],
    ["BeefThief", [
        "A lean, crouching figure with red eyes under a dark hood and face covering.",
        "Gray plates protect its chest and limbs, and a narrow gold scarf trails behind."
    ]],
    ["BigMech1", [
        "A towering robot with a stacked orange burger for a torso and a visible pilot on top.",
        "Metal fins rise behind its shoulders, with a heavy fist on one arm and a barrel on the other."
    ]],
    ["BigMech2", [
        "A bulky orange burger-shaped machine with a visible pilot in an open cockpit.",
        "Branching yellow pipes frame it, and loose wires and a broken arm hang beneath it."
    ]],
    ["BigMech2Gun", [
        "A squat orange and bronze turret built around two round housings.",
        "Two stubby gun barrels point forward, with exposed cables and metal braces between them."
    ]],
    ["BigMech2Leg", [
        "A round orange dome sits inside a flat, greenish metal rim.",
        "Bright yellow jets flare down under the rim."
    ]],
    ["Gnome", [
        "A small round-faced archer with a red headband beneath a fan of gold hair.",
        "A pale cape hangs over brown clothing, and it carries a short red bow."
    ]]
]);

const PORTRAITS = new Map([
    ["Wendy", [
        "A young woman with bright blue eyes, freckles and red hair in two tied pigtails.",
        "She wears silver armor over red-striped sleeves, with a ribbon at her collar.",
        "Two brown-wrapped spatula handles stick up behind her shoulders."
    ]],
    ["Frygor", [
        "A young man with tan skin, brown eyes and a friendly, rounded face.",
        "A red headband holds his high golden crest, and a pale cape drapes over his quiver strap.",
        "A bundle of fry-shaped arrows sticks up behind his shoulder.",
        "Part of his short bow shows beneath his hands."
    ]],
    ["FrygorUNHINGED", [
        "A tan young man with wide brown eyes, raised eyebrows and tightly clenched teeth.",
        "His red headband holds a tall golden crest, and his pale cape covers a quiver strap.",
        "Golden arrows fan out behind his shoulder, and part of his short bow shows below."
    ]],
    ["Frostyna", [
        "A young woman with lavender-blue skin, dark eyes and pale hair swept into icy curls.",
        "Her deep blue coat has white trim. A gold staff with a spiral head rises behind her."
    ]],
    ["Baconator", [
        "A broad, muscular man with deep brown skin, a thick black beard and a shaved head.",
        "A red eyepatch covers one eye. He clasps armored hands beneath large red shoulder plates."
    ]],
    ["SirChicken", [
        "A muscular man with tan skin, a square jaw and long dark hair.",
        "White wings fan out from his gold helmet, and a feathered mantle falls over gold armor."
    ]],
    ["Sir Chicken - SHADOWY", [
        "A broad man with long, dark hair and a face mostly in shadow.",
        "A gold helmet with white wings sits above a shaggy feathered mantle and plated shoulders."
    ]],
    ["Chomps", [
        "A rounded gray robot with bright blue eyes and a curved seam across its metal face.",
        "Thick red shoulder plates and gold tubing frame its chest, above jointed arms."
    ]],
    ["ElderTater", [
        "A stooped older man with tan skin, heavy white brows and a long white beard.",
        "He wears a soft yellow cap and a cream mantle with curling gold embroidery."
    ]],
    ["ElderFrosty", [
        "An older woman with lavender-blue skin, a lined face and pale hair curled into two peaks.",
        "Her deep blue dress has puffed shoulders and a lace-up front."
    ]],
    ["ElderNugget", [
        "A small round-faced figure with an uneven smile and thin twig-like arms.",
        "A floppy brown hat casts shade over pale hair and a rust-colored coat."
    ]],
    ["OldBacon", [
        "A stocky figure with graying hair, lowered brows and a deep frown.",
        "Broad pink stripes cross the front of a round brown body."
    ]],
    ["Tatoria", [
        "A young girl with tan skin, large brown eyes and golden hair tied into tufts.",
        "She clasps her hands in front of a green bodice, with blue sleeves and red wristbands."
    ]],
    ["TatoriaMechtosis", [
        "A young girl with golden hair tied into tufts, a tense face and a red gleam in her eye.",
        "She clasps her hands in front of a green bodice with blue sleeves."
    ]],
    ["MarkBorg", [
        "A light-skinned man with a bright red pompadour, angular cheeks and a wide grin.",
        "Red-tinted glasses and a white coat frame a patterned blue and yellow shirt."
    ]],
    ["MechBorg", [
        "A light-skinned man with swept-back red spikes, a pointed chin and orange-lensed goggles.",
        "He wears a red-trimmed white lab coat over a mustard-yellow buttoned shirt.",
        "A rounded gray metal casing behind his shoulder has two short orange-tipped tubes."
    ]],
    ["FrydusaSnakes", [
        "Five golden snake heads rear from a red fry carton with little red hands.",
        "Their coils overlap at the rim, and their open mouths show sharp fangs."
    ]],
    ["FrydusaVAR1Snakes", [
        "Five golden snake heads rise on thick coils from a vivid scarlet carton.",
        "Narrow eyes, white fangs and red tongues stand out against their rounded heads."
    ]],
    ["FrydusaVAR2Snakes", [
        "Five golden snake heads rise from a dark, scuffed red carton.",
        "Small red hands frame the carton, and several snake mouths hang open."
    ]],
    ['ICM', ENEMIES.get('IceCreamMachine')],
    ['MrArrow', ENEMIES.get('GoldenArcher')]
]);

// These poses describe the painted side-view atlas cells. The equipment
// inventory can assign different items without changing the artwork.
const PARTY_BATTLE_ART = new Map([
    ['Wendy_Combat', { size: [64, 64], idle: [
        'Her red pigtails and blue skirt frame her silver armor.',
        'She holds two silver spatulas with brown handles, one raised to each side.'
    ], attack: ['She crouches low with a silver spatula extended in each hand.'],
        guard: ['She raises her two spatulas close in front of her face.'],
        hurt: ['She recoils with her eyes squeezed shut and both spatulas lowered.'],
        action: ['She raises one spatula high and holds the other out to the side.'],
        down: ['She kneels with her head bowed and both spatulas lowered to the ground.'] }],
    ['Frygor', { size: [64, 64], idle: [
        'His gold crest sticks up from a red headband. He crouches with a short red bow held low.'
    ], attack: ['He raises and draws his red bow. A red quiver of golden arrows crosses his back.'] }],
    ['Frostyna', { size: [96, 96], idle: [
        'Icy curls frame her lavender-blue face above a long dark blue coat.',
        'She holds a golden spiral-headed staff across her body.'
    ], attack: ['She thrusts her golden staff straight out in front of her.'] }],
    ['Baconator', { size: [141, 64], idle: [
        'A broad, bearded man in red armor and a cape, holding a huge curved sword upright.',
        'The broad brown blade has a bright metal edge.'
    ], attack: ['He lunges and sweeps his broad, curved sword low. His red cape flares behind him.'] }],
    ['SirChicken', { size: [80, 64], idle: [
        'He wears gold armor and a winged helmet with a white feathered mantle.',
        'A chain hangs from his handle, ending in an orange drumstick-shaped flail head.'
    ], attack: ['He swings his orange flail in a wide arc, the chain stretched taut.'] }]
]);

function partyBattleArt(name, frame) {
    const art = PARTY_BATTLE_ART.get(name);
    if (!art || !frame || frame.width !== art.size[0] || frame.height !== art.size[1]) return;
    const x = frame.x / frame.width;
    const y = frame.y / frame.height;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) return;
    if (name === 'Wendy_Combat') {
        if (y === 0 && x < 6) return x < 3 ? art.idle : art.attack;
        if (y === 3 && x < 3 || y === 5 && x < 3) return art.guard;
        if (y === 4 && x < 3) return art.hurt;
        if (y === 5 && x < 9) return x < 6 ? art.action : art.down;
        return;
    }
    if (y !== 0) return;
    if (x < 2) return art.idle;
    if (name === 'Frygor' ? x >= 3 && x <= 5 : name === 'SirChicken' ? x <= 4 : x === 2) return art.attack;
}

// Each town sheet has several characters inside a single MZ character
// block. Their authored patterns are held on separate 32-pixel columns.
const TOWNSPEOPLE = new Map([
    ['NPCs - 32x32', {
        1: ['A round-faced woman with brown hair, dark eyes and a white bonnet.',
            'Her blue dress has white sleeves and a pale apron.'],
        3: ['A round-faced man with short brown hair and dark eyes.',
            'He wears a green shirt with light sleeves and brown trousers.'],
        5: ['A balding older man with white hair at his temples and a long white beard.',
            'He stoops forward in brown and olive clothes, leaning on a walking stick.'],
        7: ['An older woman with gray hair under a brown kerchief and a lined face.',
            'A pale apron shows against her brown dress.'],
        9: ['A small, round-faced figure with brown hair under a white cap.',
            'Blue and green clothing and small reddish shoes stand out.'],
        13: ['A man with a round face and dark hair under a blue-gray cap.',
            'He wears a yellow shirt and dark trousers.']
    }],
    ['NPCs - 32x32 - palette2', {
        1: ['A woman with brown skin, dark hair and a white bonnet.',
            'Her olive-green dress has white sleeves and a pale apron.'],
        3: ['A brown-skinned man with a rounded face and dark, wavy hair.',
            'He wears a blue shirt and reddish trousers.'],
        5: ['A balding older man with brown skin, white hair at his temples and a long white beard.',
            'He stoops forward in brown and olive clothes, leaning on a walking stick.'],
        7: ['An older woman with brown skin and gray hair showing beneath a red headscarf.',
            'She wears a red dress and a pale apron.'],
        9: ['A small, brown-skinned figure with dark hair under a white cap.',
            'The outfit has orange and yellow stripes.']
    }],
    ['NPC - Wendys Staff', {
        0: ['A worker with brown skin and tufts of dark hair under a red Wendy’s visor.', 'He wears a dark blue uniform with red trim.'],
        1: ['A worker with brown skin and dark hair under a red Wendy’s cap.', 'She wears a dark blue uniform and white shoes.'],
        2: ['A worker with tan skin and dark hair under a blue cap with a red brim.', 'He wears a dark blue uniform with red trim.'],
        3: ['A round-faced worker with fair skin and a red Wendy’s visor.', 'He wears a dark blue uniform with red trim.'],
        4: ['A worker with fair skin and an orange ponytail under a red Wendy’s visor.', 'She wears a dark blue uniform with red trim.'],
        12: ['A worker with brown skin and tufts of dark hair under a red Wendy’s visor.', 'He holds a takeout box.'],
        13: ['A worker with brown skin and dark hair under a red Wendy’s cap.', 'She holds a red-and-yellow takeout box.'],
        15: ['A round-faced worker with fair skin and a red Wendy’s visor.', 'He holds a takeout box.'],
        16: ['A worker with fair skin and an orange ponytail under a red Wendy’s visor.', 'She holds a red-and-yellow takeout box.']
    }]
]);

const FIELD_ART = new Map([
    ['~Wendy', [
        'A freckled young woman with bright blue eyes and red pigtails tied with blue ribbons.',
        'She wears silver armor over a white and blue skirt, with a small red bow at her throat.'
    ]],
    ['~ElderTater', [
        'A stooped older man with a yellow cap, heavy white eyebrows and a long white beard.',
        'His olive and gold robes have a broad cream collar.'
    ]],
    ['~Frygor', [
        'A round-faced young man with tan skin and a golden crest held by a red headband.',
        'He wears gold armor with dark red trim and boots.'
    ]],
    ['~BeefThief', [
        'A slim figure with red eyes under a pointed dark blue hood edged in gold.',
        'Gray armor and a pale belt stand out against the dark outfit.'
    ]],
    ['~NPCDOG', [
        'A small dark brown dog with drooping ears, stubby legs and a tail curled up over its back.',
        'Yellow markings stand out around its face.'
    ]],
    ['~MechGrunt', [
        'A squat gray robot with a rounded helmet, a narrow yellow visor and broad red shoulder plates.',
        'Its thick jointed arms end in dark fists, and its feet are red.'
    ]],
    ['~MECHDOUBLE1World', [
        'A stocky gold robot with a smooth rounded helmet and red eyes.',
        'It has a boxy chest, jointed arms and wide metal feet.'
    ]],
    ['~MECHDOUBLE2World', [
        'A stocky gold robot with two thin antennae above narrow red eyes.',
        'Its square chest sits between thick jointed arms and flat metal feet.'
    ]],
    ['TREASURE CHEST SPECIAL', [
        'A squat turquoise chest with bright gold bands and small jewel-like studs.',
        'A star-shaped clasp sits in the middle of the front.'
    ]],
    ['~HotSludgeSundae', ENEMIES.get('HotSludgeSundae')],
    ['~HeatLamp', ENEMIES.get('HeatLamp')],
    ['~Axoflopl', ENEMIES.get('Axoflopl')],
    ['~LilSalty', ENEMIES.get('LilSalty')]
]);

function enemyArt(name) { return ENEMIES.get(name); }

function portraitArt(name) {
    if (typeof name !== 'string') return;
    const still = name.replace(/(?:Concerned|Excited|Angry|Sad|Upset|Shock)$/, '');
    return PORTRAITS.get(still) || enemyArt(still);
}

function fieldArt(name, index, frame) {
    if (typeof name !== 'string' || !Number.isInteger(index) || index < 0 || index > 7) return;
    const affected = name.startsWith('NPCs - MECHTOSIS - ');
    const colors = affected ? name.replace('MECHTOSIS - ', '') : name;
    const sheet = TOWNSPEOPLE.get(colors);
    if (!sheet) return FIELD_ART.get(name);
    if (!frame || frame.width !== 32 || frame.height !== 32) return;
    const column = frame.x / 32;
    const row = frame.y / 32;
    const block = Math.floor(index / 4);
    if (!Number.isInteger(column) || !Number.isInteger(row) ||
        Math.floor(column / 3) !== index % 4 || Math.floor(row / 4) !== block) return;
    const description = sheet[block * 12 + column];
    if (!affected || !description) return description;
    return ['A gray-faced figure with red eyes.', ...description.slice(1)];
}

module.exports = { enemyArt, portraitArt, fieldArt, partyBattleArt };
