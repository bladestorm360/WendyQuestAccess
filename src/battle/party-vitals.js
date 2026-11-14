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

function visibleCondition(hud, graphics, id) {
    const row = hud.stateIcons?.[id];
    const icon = row?.children?.[1];
    const top = hud.y + row?.y;
    if (row?.parent !== hud || !row.worldVisible || !(row.worldAlpha > 0) ||
        !(top >= 0 && top + 16 <= graphics.height) || !visibleSprite(row, icon)) return '';
    return drawnText(icon, icon.children?.[0], 32);
}

function statusLines(hud, graphics) {
    const states = hud.states;
    if (!Array.isArray(states) || states.length > 24) return [];
    const lines = [];
    let line = '';
    for (const id of states) {
        const name = visibleCondition(hud, graphics, id);
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

function experience(hud) {
    const bar = hud.levelMetreSprite;
    const fill = hud.levelMetreFillSprite;
    const mask = hud.fillXPMask;
    if (!visibleSprite(hud, bar) || !visibleSprite(hud, fill) || !mask || mask.parent !== hud ||
        fill.mask !== mask || !Array.isArray(mask.geometry?.graphicsData)) return '';
    const shapes = mask.geometry.graphicsData;
    if (!shapes.length) return 'experience bar empty';
    const shape = shapes[0]?.shape;
    const height = shape?.height;
    // The installed HUD clips the XP art with one 32-pixel-high mask.
    if (shapes.length !== 1 || !Number.isInteger(height) || height < 0 || height > 32 ||
        shape.x !== -39 || shape.width !== 32 || shape.y !== 114 - height) return '';
    if (!height) return 'experience bar empty';
    return height === 32 ? 'experience bar full' :
        'experience bar ' + Math.round(100 * height / 32) + ' percent';
}

function radialPercent(hud, fill, mask, radius, end) {
    if (!visibleSprite(hud, fill) || mask?.parent !== hud || fill.mask !== mask ||
        mask.currentPath?.points?.length > 2) return null;
    const shapes = mask.geometry?.graphicsData;
    if (!Array.isArray(shapes)) return null;
    if (!shapes.length) return 0;
    const points = shapes[0]?.shape?.points;
    if (shapes.length !== 1 || !Array.isArray(points) || points.length % 2 ||
        points.length < 6 || points.length > 512) return null;

    const base = 0.43 * Math.PI;
    const start = base - 0.05;

    const x = points[points.length - 2] + 47;
    const y = points[points.length - 1] - 47;
    if (!(Math.abs(points[0] + 47 - radius * Math.cos(start)) < 0.001 &&
        Math.abs(points[1] - 47 - radius * Math.sin(start)) < 0.001 &&
        Math.abs(Math.hypot(x, y) - radius) < 0.001)) return null;
    let angle = Math.atan2(y, x);
    if (angle < 0) angle += 2 * Math.PI;
    // The installed PIXI path starts at moveTo and its last sampled point
    // is the arc endpoint. The native mask starts slightly before zero fill.
    const percent = 100 * (angle - base) / (end - base);
    return percent >= -0.001 && percent <= 100.001 ? Math.round(percent) : null;
}

function meter(label, percent) {
    return percent === null ? '' : label + ' bar ' + percent + ' percent';
}

function hudVitals(hud, graphics, name, includeExperience = false, mapMeters = false) {
    const hp = pairedValue(hud, 'HP', hud._HPIcon, hud._numberSprite, hud._dividerSprite, hud._totalSprite) ||
        (mapMeters && meter('HP', radialPercent(hud, hud.fillSprite, hud.fillMask, 43, 1.21 * Math.PI)));
    const fp = pairedValue(hud, 'FP', hud._FPIcon, hud._FPSprite, hud._dividerSpriteFP, hud._totalSpriteFP) ||
        (mapMeters && visibleSprite(hud, hud.backingFP) &&
            meter('FP', radialPercent(hud, hud.fillFPSprite, hud.fillFPMask, 57, Math.PI)));
    const level = number(hud, hud.levelNumberSprite);
    const progress = level && includeExperience && experience(hud);
    const lines = reviewLines([name, hp, fp, level && 'Level ' + level + (progress ? ', ' + progress : ''),
        momentum(hud), ...statusLines(hud, graphics)]);
    return lines.length > 1 ? { kind: 'menuDetails', lines } : null;
}

function fieldVitalsVisible(scene) {
    const hud = scene?._statusWindow;
    return visibleSprite(scene, hud) && hud.offsetY === 0 && !!hud.battler;
}

function sceneVitals(scene, graphics, mapMeters) {
    if (!fieldVitalsVisible(scene)) return null;
    const hud = scene._statusWindow;
    const name = hud.battler.actor?.()?.name;
    return hudVitals(hud, graphics, typeof name === 'string' && name.length <= 48 && name ? name : 'Party status',
        true, mapMeters);
}

function fieldVitals(scene, graphics) {
    return sceneVitals(scene, graphics, true);
}

function menuVitals(scene, graphics) {
    return scene._wqaMenuStatus === scene._statusWindow ? sceneVitals(scene, graphics, false) : null;
}

function battleVitals(scene, graphics) {
    // The native HUD binds only the first battle member. Companion command
    // focus and Swap do not change the owner of the visible vitals.
    const main = portraitActor(scene, scene._spriteset?._actorSprites?.[0]);
    if (!main || !fieldVitalsVisible(scene) || scene._statusWindow.battler !== main.actor) return null;
    return hudVitals(scene._statusWindow, graphics, main.name);
}

module.exports = { portraitActor, battleVitals, menuVitals, fieldVitals, fieldVitalsVisible, visibleCondition };