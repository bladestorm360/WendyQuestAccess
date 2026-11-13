'use strict';

const { drawnText } = require('./presentation');
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
    return enemyLabel(scene, enemy, false);
}

function enemyLabel(scene, enemy, includeCollapsed = true) {
    const set = scene._spriteset;
    const field = set?._battleField;
    const enemies = set?._enemySprites;
    if (!Array.isArray(enemies) || enemies.length > MAX_BATTLERS || !enemies.includes(enemy) || enemy?.parent !== field) return '';
    if (includeCollapsed && !attached(enemy, field)) return '';
    // Keep the left-to-right index stable as earlier enemies collapse.
    const presented = enemies.filter(sprite => Number.isFinite(sprite.x) &&
        (includeCollapsed ? sprite?.parent === field : attached(sprite, field)))
        .sort((left, right) => left.x - right.x);
    const position = presented.indexOf(enemy);
    if (position < 0) return 'Enemy';
    const name = drawnText(enemy, enemy._nameSprite, 48);
    return presented.length > 1 ? (name ? name + ', enemy ' : 'Enemy ') + (position + 1) : name || 'Enemy';
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
    if (text === 'MISS') return who + ', miss';

    const number = NUMBER.exec(text);
    if (!number) return '';
    const [, amount, element, status, fp] = number;
    // The two FP directions share a color and the displayed number is unsigned.
    const result = amount === 'BLOCKED' ? 'blocked' : amount + (fp ? ' FP' :
        popup._colorType === 1 ? ' HP recovered' : ' HP damage');
    const effectiveness = element === '(' ? 'elemental weakness' : element === ')' ? 'elemental resistance' : '';
    const adjustment = status === '[' ? 'boosted' : status === ';' ? 'reduced' : status === ';;' ? 'strongly reduced' : '';
    return [who, result, effectiveness, adjustment].filter(Boolean).join(', ');
}

module.exports = { damageCaption, enemyLabel };
