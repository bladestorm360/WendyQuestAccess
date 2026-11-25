'use strict';

const { drawnText, enemyName } = require('./presentation');
const { portraitActor } = require('./party-vitals');

const MAX_BATTLERS = 8;
const NUMBER = /^(BLOCKED|\d{1,9})([()])?(\[|;{1,2})?(FP)?$/;

function attached(sprite, parent) {
    return !!(parent && sprite?.parent === parent && sprite.worldVisible && sprite.worldAlpha > 0 &&
        sprite.renderable !== false);
}

function popupOwner(scene, popup, target) {
    const set = scene._spriteset;
    const field = set?._battleField;
    const matches = sprite => sprite?._battler === target && sprite._damages?.includes(popup);

    const actors = set?._actorSprites;
    if (Array.isArray(actors) && actors.length <= MAX_BATTLERS) {
        const actor = actors.find(matches);
        if (actor?.parent === field) return portraitActor(scene, actor)?.name || 'Party';
    }

    const enemies = set?._enemySprites;
    if (!Array.isArray(enemies) || enemies.length > MAX_BATTLERS) return '';
    const enemy = enemies.find(matches);
    if (enemy?.parent !== field) return '';
    return drawnText(enemy, enemy._nameSprite, 48) || enemyName(enemy) || 'Enemy';
}

function enemyLabel(scene, enemy) {
    const set = scene._spriteset;
    const field = set?._battleField;
    const enemies = set?._enemySprites;
    if (!Array.isArray(enemies) || enemies.length > MAX_BATTLERS || !enemies.includes(enemy) || enemy?.parent !== field) return '';
    if (!attached(enemy, field)) return '';
    return drawnText(enemy, enemy._nameSprite, 48) || enemyName(enemy) || 'Enemy';
}

// The game uses separate lightweight skills for regular companion turns and
// enemy melee or arrows. Native action text still owns named special moves.
const COMPANION_ATTACKS = new Set([9, 12, 14, 17]);
//110 is Blandhawk's guaranteed-Bland onboarding strike. It shares87's
//visible melee animation and has no displayed ability heading.
const ENEMY_ATTACKS = new Set([1, 48, 49, 51, 56, 81, 82, 83, 84, 85, 87, 88, 90, 91, 92, 95, 96, 97, 98, 106, 110]);

function attackSource(scene, performer, subject, action) {
    if (!action?.isSkill?.()) return;
    const skill = action.item();
    if (!skill || skill.message1 || skill.message2) return;
    const sprites = scene._spriteset;
    const allies = sprites?._actorSprites;
    const enemies = sprites?._enemySprites;
    const actor = allies?.length <= MAX_BATTLERS && allies.find(sprite => sprite._battler === subject);
    let name;
    if (actor && actor.parent === sprites._battleField) {
        // The native dispatcher supplies the performer when it starts an effect.
        // A companion acts through Wendy's battle action but binds its own actor
        // record. Names are already known at dispatch while the bitmap or pose
        // being checked by the appearance description can change.
        if (COMPANION_ATTACKS.has(skill.id)) {
            if (performer === sprites._subActorSprite && performer?.parent === sprites._battleField)
                name = performer._actor?.name;
            else if (performer === actor) name = subject.name?.();
        } else if (skill.id === 5 || skill.id === 1) {
            name = subject.name?.();
        }
    } else if (!actor && ENEMY_ATTACKS.has(skill.id) && enemies?.length <= MAX_BATTLERS) {
        const enemy = enemies.find(sprite => sprite._battler === subject || sprite._enemy === subject);
        if (attached(enemy, sprites._battleField)) name = drawnText(enemy, enemy._nameSprite, 48) || enemyName(enemy);
    }
    return typeof name === 'string' && name.length <= 48 ? name.trim() : '';
}

// The native action-result queue runs before both sprite producers.
// Keep the same ticket when Sprite_Damage later constructs the number.
function expectLethalDamage(scene, target) {
    const result = target?.result?.();
    if (target?.isEnemy?.() !== true || target.isDead?.() !== true || !result?.hpAffected ||
        !(result.hpDamage > 0) || result.missed || result.evaded) return null;
    if (result._wqaLethalDamage) return result._wqaLethalDamage;
    const ticket = { queued: false };
    result._wqaLethalDamage = ticket;
    (scene._wqaLethalDamage ||= new WeakMap()).set(target, ticket);
    return ticket;
}

function abilitySource(scene, item, format) {
    // The two Rise and Shine command rows omit the caster from native text.
    if (item.message1 !== format) return '';
    const performer = portraitActor(scene, scene._spriteset?._subActorSprite);
    return performer?.actor.id === 2 ? performer.name : '';
}

function damageCaption(scene, graphics, popup) {
    const paint = popup._wqaDamageCaption;
    if (!paint || !attached(popup, scene._spriteset?._battleField) || !(popup._duration > 0)) return '';
    const point = paint.text.worldTransform;
    if (!point || !(point.tx >= 0 && point.tx < graphics.width && point.ty >= 0 && point.ty < graphics.height)) return '';
    const text = drawnText(popup, paint.text, 16);
    if (!text) return '';
    const who = popupOwner(scene, popup, paint.target);
    if (!who) return '';
    if (text === 'MISS') return paint.source ? paint.source.name + ' misses' : who + ', miss';

    const number = NUMBER.exec(text);
    if (!number) return '';
    const [, amount, element, status, fp] = number;
    // The two FP directions share a color and the displayed number is unsigned.
    const basic = paint.source && !fp && popup._colorType !== 1;
    const result = amount === 'BLOCKED' ? 'blocked' : amount + (fp ? ' FP' :
        popup._colorType === 1 ? ' HP recovered' : basic ? ' damage' : ' HP damage');
    const effectiveness = element === '(' ? 'elemental weakness' : element === ')' ? 'elemental resistance' : '';
    const adjustment = status === '[' ? 'boosted' : status === ';' ? 'reduced' : status === ';;' ? 'strongly reduced' : '';
    const heading = basic ? (paint.source.start?.name === paint.source.name ? '' : paint.source.name + ' attacks') : who;
    return [heading, result, effectiveness, adjustment].filter(Boolean).join(', ');
}

module.exports = { damageCaption, enemyLabel, attackSource, abilitySource, expectLethalDamage };
