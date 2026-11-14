'use strict';

// Appearance only. Keys identify the verified art, including palette variants.
const ENEMIES = new Map([
    ['Frydusa', 'A red carton with golden snakes coiling from the top.'],
    ['Frydusa - VAR1', 'A scarlet carton with a crown of curling golden snakes.'],
    ['Frydusa - VAR2', 'A dark red carton topped by thick coils of golden snakes.'],
    ['Cacodemon', 'A short figure with a fan-shaped gold crest and red and gold armor.'],
    ['GoldenArcher', 'A gold armored figure with a narrow visor and a drawn bow.'],
    ['GoldenArcherVAR1', 'An archer in black and gold armor with a bright orange visor.'],
    ['MechFry', 'A red and gold robot shaped like a carton of fries, with a heavy claw.'],
    ['LilSalty', 'An icy blue creature with a spiky round body, purple eyes and sharp teeth.'],
    ['LilSaltyVar1', 'A pale pink spiky creature with dark eyes and a jagged mouth.'],
    ['SoggySnake', 'A smooth golden snake rears from a dark patch of earth.'],
    ['Conehead', 'A dripping blue creature with an upside-down cone for a hat.'],
    ['Conehead - VAR1', 'A pool of pink sludge with an upside-down waffle cone on top.'],
    ['HotSludgeSundae', 'A hunched mass of brown sludge with a glowing eye and rows of teeth.'],
    ['MechDouble', 'Two yellow machines with matching rounded helmets and segmented arms.'],
    ['MechFlurry', 'A blue armored robot holding up a scoop of speckled ice cream.'],
    ['IceCreamMachine', 'A pale blue machine with a black visor, red eyes and long claws.'],
    ['BlandHawk', 'A round brown creature with leathery wings, large eyes and small fangs.'],
    ['MechChicken', 'A dark angular robot with a red crest, orange lights and blade-like wings.'],
    ['MechNugget', 'A golden nugget face inside a gray mechanical suit with orange hoses.'],
    ['HeatLamp', 'A red crawling creature with a glowing round lamp above its teeth.'],
    ['HeatLampVAR1', 'A charred crawling creature with a pale round lamp above its teeth.'],
    ['Axoflopl', 'A pink axolotl-like creature with curling gills, limbs and tail.'],
    ['MechMuffin', 'A round sandwich-shaped machine on thin, hooked mechanical legs.'],
    ['OrEggAmi', 'A pale yellow folded figure with a broad jaw and small blue eyes.'],
    ['Iceburger', 'An ice-blue burger with pointed horns, red eyes and a huge toothed grin.'],
    ['MechFreezer', 'An upright blue freezer with icy claws and a face on the door.'],
    ['BeefThief', 'A dark hooded figure with red eyes, a mask and metal armor.'],
    ['BigMech1', 'A towering orange robot with a stacked burger body and heavy metal arms.'],
    ['BigMech2', 'A bulky orange machine with branching yellow pipes and an open cockpit.'],
    ['BigMech2Gun', 'A squat orange and bronze turret with two forward gun barrels.'],
    ['BigMech2Leg', 'An orange dome with a flat metal rim and bright yellow jets underneath.'],
    ['Gnome', 'A tiny figure with a spotted pink mushroom cap and a glowing blue wand.']
]);

const PORTRAITS = new Map([
    ['Wendy', 'Red pigtails, blue eyes and silver armor tied with a red and blue bow.'],
    ['Frygor', 'A golden fry-shaped crest, a red headband and a quiver of fries.'],
    ['FrygorUNHINGED', 'A golden fry-shaped crest, a red headband and a clenched expression.'],
    ['Frostyna', 'A blue-skinned figure in a blue coat, with icy hair and an ornate gold staff.'],
    ['Baconator', 'A broad armored figure with dark skin, a black beard and red shoulder plates.'],
    ['SirChicken', 'A gold winged helmet, a white feathered mantle and gold shoulder armor.'],
    ['Sir Chicken - SHADOWY', 'A shadowed face beneath a golden helmet with white wings.'],
    ['Chomps', 'A round gray robot with blue eyes, red shoulders and gold trim.'],
    ['ElderTater', 'A stooped figure with a white beard, a yellow cap and a cream robe.'],
    ['ElderFrosty', 'A blue-skinned elder with pale hair swept up at the sides and a blue dress.'],
    ['ElderNugget', 'A small round-faced figure with a broad brown hat and twig-like arms.'],
    ['OldBacon', 'A stocky figure with gray swept hair and pink stripes on a brown shirt.'],
    ['Tatoria', 'A small figure with bright golden hair tied in tufts and blue sleeves.'],
    ['TatoriaMechtosis', 'Golden tufts of hair and a shadowed face with a red eye.'],
    ['MarkBorg', 'A red pompadour, tinted glasses and a white coat over a patterned shirt.'],
    ['MechBorg', 'Spiked red hair, orange goggles, a gray mustache and a white coat.'],
    ['ICM', ENEMIES.get('IceCreamMachine')],
    ['MrArrow', ENEMIES.get('GoldenArcher')],
    ['FrydusaSnakes', 'Golden snake heads coil together above a bright red carton.'],
    ['FrydusaVAR1Snakes', 'Golden snake heads coil together above a scarlet carton.'],
    ['FrydusaVAR2Snakes', 'Golden snake heads coil together above a dark red carton.']
]);

const TOWNSPEOPLE = new Map([
    ['NPCs - 32x32', [
        'A person in a white bonnet and a blue dress with white sleeves.',
        'Short brown hair, a green shirt and dark trousers.',
        'A gray-haired person with round glasses and a brown dress.',
        'A small person in a white cap and blue and green clothes.',
        'A gray cap, yellow shirt and dark trousers.'
    ]],
    ['NPCs - 32x32 - palette2', [
        'A person in a white bonnet and an olive-green dress.',
        'A short-haired person in a blue shirt and reddish trousers.',
        'A person in a red headscarf and dress, with a white apron.',
        'A small person in a white cap and orange clothes.'
    ]],
    ['NPC - Wendys Staff', [
        'A red Wendy’s cap and a dark blue uniform with red trim.',
        'Red hair under a red Wendy’s visor, with a dark blue uniform.',
        '', '',
        'A red Wendy’s cap and blue uniform, holding a red-and-yellow takeout box.',
        'A red ponytail under a Wendy’s visor, holding a red-and-yellow takeout box.'
    ]]
]);

const FIELD_ART = new Map([
    ['~NPCDOG', 'A small brown dog with drooping ears and a black nose.'],
    ['~MechGrunt', 'A small gray robot with a dark visor, gold trim and red shoulder plates.'],
    ['~HotSludgeSundae', ENEMIES.get('HotSludgeSundae')],
    ['~HeatLamp', ENEMIES.get('HeatLamp')],
    ['~Axoflopl', ENEMIES.get('Axoflopl')],
    ['~LilSalty', ENEMIES.get('LilSalty')]
]);

function enemyArt(name) { return ENEMIES.get(name) || ''; }

function portraitArt(name) {
    if (typeof name !== 'string') return '';
    const still = name.replace(/(?:Concerned|Excited|Angry|Sad|Upset|Shock)$/, '');
    return PORTRAITS.get(still) || enemyArt(still);
}

function fieldArt(name, index) {
    if (typeof name !== 'string' || !Number.isInteger(index) || index < 0 || index > 7) return '';
    const affected = name.startsWith('NPCs - MECHTOSIS - ');
    const colors = affected ? name.replace('MECHTOSIS - ', '') : name;
    const description = TOWNSPEOPLE.get(colors)?.[index] || FIELD_ART.get(name);
    return affected && description ? 'A gray-faced figure with red eyes. ' + description : description || '';
}

module.exports = { enemyArt, portraitArt, fieldArt };
