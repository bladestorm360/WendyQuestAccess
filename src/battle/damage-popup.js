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
    // Keep the left-to-right index stable as earlier enemies collapse.
    const presented = enemies.filter(sprite => Number.isFinite(sprite.x) && sprite?.parent === field)
        .sort((left, right) => left.x - right.x);
    const position = presented.indexOf(enemy);
    if (position < 0) return 'Enemy';
    const name = drawnText(enemy, enemy._nameSprite, 48) || enemyName(enemy);
    return presented.length > 1 ? (name ? name + ', enemy ' : 'Enemy ') + (position + 1) : name || 'Enemy';
}

function recordAttackSource(scene, target, performer, subject, companionAction) {
    // Add attribution only for the companion that the native visual
    // dispatcher actually used. It can fall back to Wendy.
    if (!companionAction || !performer || performer !== scene._spriteset?._subActorSprite ||
        !scene._spriteset?._actorSprites?.some(sprite => sprite._actor === subject)) return;
    const result = target.result();
    const companion = result?.used && portraitActor(scene, performer);
    if (companion) result._wqaAttackSource = companion.name;
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
    const source = paint.source ? paint.source + ' to ' + who : who;
    if (text === 'MISS') return paint.source ? paint.source + ' misses ' + who : who + ', miss';

    const number = NUMBER.exec(text);
    if (!number) return '';
    const [, amount, element, status, fp] = number;
    // The two FP directions share a color and the displayed number is unsigned.
    const result = amount === 'BLOCKED' ? 'blocked' : amount + (fp ? ' FP' :
        popup._colorType === 1 ? ' HP recovered' : ' HP damage');
    const effectiveness = element === '(' ? 'elemental weakness' : element === ')' ? 'elemental resistance' : '';
    const adjustment = status === '[' ? 'boosted' : status === ';' ? 'reduced' : status === ';;' ? 'strongly reduced' : '';
    return [amount === 'BLOCKED' && paint.source ? paint.source + ' blocked by ' + who :
        source, amount === 'BLOCKED' && paint.source ? '' : result, effectiveness, adjustment].filter(Boolean).join(', ');
}

module.exports = { damageCaption, enemyLabel, recordAttackSource, abilitySource };
