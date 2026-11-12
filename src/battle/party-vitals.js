'use strict';

const { drawnText, visibleSprite } = require('./presentation');
const { reviewLines } = require('../menus/review');

function portraitActor(scene, sprite) {
    const sprites = scene._spriteset;
    const actor = sprite?._actor;
    const art = sprite?._mainSprite;
    if (!actor || !visibleSprite(art === sprite ? sprite.parent : sprite, art)) return null;
    // The native main and companion sprites bind their animation to the
    // battler image of this exact actor record. The companion has no own HUD.
    const companion = sprite === sprites?._subActorSprite;
    if (!companion && !sprites?._actorSprites?.includes(sprite)) return null;
    const data = companion ? actor : actor.actor?.();
    if (!data?.name || data.name.length > 48 || !data.battlerName || data.battlerName !== sprite._battlerName) return null;
    return { actor, companion, name: data.name };
}

function number(parent, text) {
    const value = drawnText(parent, text, 8);
    return /^\d+$/.test(value) ? value : '';
}

function pairedValue(hud, label, icon, current, divider, total) {
    if (!visibleSprite(hud, icon)) return '';
    const value = number(hud, current);
    if (!value) return '';
    const max = drawnText(hud, divider, 1) === '/' && number(hud, total);
    return label + ' ' + value + (max ? ' of ' + max : '');
}

function momentum(hud) {
    const pips = hud.momentumPips;
    if (!Array.isArray(pips) || !pips.length || pips.length > 5) return '';
    let filled = 0;
    for (const pip of pips) {
        const sprite = pip?.baseSprite;
        const frame = sprite?._frame;
        if (!visibleSprite(hud, sprite) || frame?.y !== 0 || (frame.x !== 0 && frame.x !== 32)) return '';
        if (frame.x === 32) filled++;
    }
    return 'Momentum ' + filled + ' of ' + pips.length;
}

function statusLines(hud, graphics) {
    const states = hud.states;
    if (!Array.isArray(states) || states.length > 24) return [];
    const lines = [];
    let line = '';
    for (const id of states) {
        const row = hud.stateIcons?.[id];
        const icon = row?.children?.[1];
        // The native state holder has no bitmap of its own. Check its
        // viewport location and the attached icon and painted label.
        const top = hud.y + row?.y;
        if (row?.parent !== hud || !row.worldVisible || !(row.worldAlpha > 0) ||
            !(top >= 0 && top + 16 <= graphics.height) || !visibleSprite(row, icon)) continue;
        const name = drawnText(icon, icon.children?.[0], 32);
        if (!name) continue;
        if (line && line.length + name.length + 2 > 96) {
            lines.push(line);
            line = '';
        }
        line = line ? line + ', ' + name : 'Status, ' + name;
    }
    if (line) lines.push(line);
    return lines;
}

function partyVitals(scene, graphics, sprite, hpOnly = false) {
    const displayed = portraitActor(scene, sprite);
    if (!displayed) return null;
    const hud = scene._statusWindow;
    const main = scene._spriteset?._actorSprites?.[0];
    const open = visibleSprite(scene, hud) && hud.offsetY === 0 && hud.battler && hud.battler === main?._actor;
    if (displayed.companion) {
        const fp = !hpOnly && open && pairedValue(hud, 'Shared FP', hud._FPIcon, hud._FPSprite,
            hud._dividerSpriteFP, hud._totalSpriteFP);
        const icon = sprite._FPIcon;
        const ready = !hpOnly && visibleSprite(sprite, icon) && icon._frame?.x === 32 &&
            ({ 0: 'Companion skill available', 32: 'Companion skills unavailable' }[icon._frame.y]);
        return { kind: 'menuDetails', lines: reviewLines([displayed.name, fp, ready, !fp && !ready &&
            (hpOnly ? 'HP unavailable' : 'Vitals unavailable')]) };
    }
    if (!open || hud.battler !== displayed.actor) return null;
    const hp = pairedValue(hud, 'HP', hud._HPIcon, hud._numberSprite, hud._dividerSprite, hud._totalSprite);
    if (hpOnly && !hp) return null;
    const fp = !hpOnly && pairedValue(hud, 'FP', hud._FPIcon, hud._FPSprite, hud._dividerSpriteFP, hud._totalSpriteFP);
    const level = !hpOnly && number(hud, hud.levelNumberSprite);
    const lines = reviewLines([displayed.name, hp, fp, level && 'Level ' + level,
        !hpOnly && momentum(hud), ...(hpOnly ? [] : statusLines(hud, graphics))]);
    return lines.length > 1 ? { kind: 'menuDetails', lines } : null;
}

module.exports = { portraitActor, partyVitals };