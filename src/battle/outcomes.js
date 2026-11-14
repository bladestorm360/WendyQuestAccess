'use strict';

const { drawnText, visibleSprite } = require('./presentation');
const { enemyIconIndex, enemyState } = require('./enemy-state');
const { enemyLabel, expectLethalDamage } = require('./damage-popup');
const { portraitActor, visibleCondition, visibleMomentum } = require('./party-vitals');

const MAX_RESULTS = 8;
// RPG Maker rotates the enemy icon every 40 frames. The observation window
// covers eight icons with a sample only after each six presented frames.
const ICON_WINDOW = 336;

function recordCollapse(scene, sprite) {
    const field = scene?._spriteset?._battleField;
    if (!field || sprite.parent !== field || !visibleSprite(field, sprite)) return;
    const name = enemyLabel(scene, sprite);
    if (!name || (scene._wqaEnemyCollapses?.length || 0) >= MAX_RESULTS) return;
    const target = sprite._battler || sprite._enemy;
    const ticket = scene._wqaLethalDamage?.get(target) ||
        (target?.isDamagePopupRequested?.() ? expectLethalDamage(scene, target) : null);
    (scene._wqaEnemyCollapses ||= []).push({ name, ticket });
    if (!ticket || ticket.queued) scene._wqaDefeatDue = true;
}

function readCollapses(scene) {
    const lines = [];
    scene._wqaDefeatDue = false;
    if (!scene._wqaEnemyCollapses?.length) return lines;
    scene._wqaEnemyCollapses = scene._wqaEnemyCollapses.filter(({ name, ticket }) => {
        if (ticket && !ticket.queued) return true;
        lines.push(name + ' defeated.');
        return false;
    });
    return lines;
}

function recordResistance(scene, effect, text, frame) {
    const field = scene._spriteset?._battleField;
    if (!field || effect.parent !== field || text.parent !== effect) return;
    const queue = scene._wqaResistedRows ||= [];
    if (queue.length < MAX_RESULTS) queue.push({ effect, text, expires: frame + 90 });
}

function readResistance(scene, graphics) {
    const field = scene._spriteset?._battleField;
    const lines = [];
    if (!scene._wqaResistedRows?.length) return lines;
    scene._wqaResistedRows = scene._wqaResistedRows.filter(({ effect, text, expires }) => {
        if (!field || effect.parent !== field || text.parent !== effect || graphics.frameCount > expires) return false;
        const pose = text.worldTransform;
        if (!(pose?.tx >= 0 && pose.tx < graphics.width && pose.ty >= 0 && pose.ty < graphics.height) ||
            !effect.worldVisible || effect.worldAlpha <= 0 || !effect.scale?.x || !effect.scale?.y ||
            drawnText(effect, text, 12) !== 'RESISTED!') return true;
        lines.push('Wendy resisted a status effect.');
        return false;
    });
    return lines;
}

// The HUD updates its target only on native gains or spends. The target
// wakes the observer, but only the rendered pips can supply the spoken count.
function recordMomentum(scene, hud, frame, ready) {
    const before = scene._wqaMomentumValue;
    const sameHud = scene._wqaMomentumHud === hud && scene._wqaMomentumPips === hud.momentumPips;
    const after = hud._momentumCurrent;
    scene._wqaMomentumValue = after;
    scene._wqaMomentumHud = hud;
    scene._wqaMomentumPips = hud.momentumPips;
    if (!sameHud || !ready || !Number.isInteger(before) || !Number.isInteger(after) || after <= before) {
        scene._wqaMomentumPending = null;
        return;
    }
    scene._wqaMomentumPending = { target: after, until: frame + 90 };
    scene._wqaMomentumNextFrame = frame;
}

function readMomentum(scene, graphics) {
    const pending = scene._wqaMomentumPending;
    if (!pending || graphics.frameCount < scene._wqaMomentumNextFrame) return '';
    const hud = scene._statusWindow;
    if (graphics.frameCount > pending.until || hud !== scene._wqaMomentumHud ||
        hud.momentumPips !== scene._wqaMomentumPips || hud._momentumCurrent !== pending.target) {
        scene._wqaMomentumPending = null;
        return '';
    }
    const pips = visibleSprite(scene, hud) && hud.offsetY === 0 && visibleMomentum(hud);
    if (!pips || pips.filled !== pending.target) {
        scene._wqaMomentumNextFrame = graphics.frameCount + 3;
        return '';
    }
    scene._wqaMomentumPending = null;
    return `Momentum gained. ${pips.filled} of ${pips.total}.`;
}

function recordCondition(root, scene, target, state, added, speak) {
    const id = state?.id;
    const icon = state?.iconIndex;
    if (!Number.isInteger(id) || id <= 0 || id > 64 || !Number.isInteger(icon) || icon <= 0) return;
    const queue = scene._wqaBattleConditions ||= [];
    const prior = queue.findIndex(entry => entry.target === target && entry.id === id);
    if (prior >= 0) queue.splice(prior, 1);
    if (queue.length >= MAX_RESULTS) return;
    const frame = root.Graphics.frameCount || 0;
    queue.push({ target, id, icon, added, speak, until: frame + ICON_WINDOW });
    scene._wqaNextConditionFrame = frame;
}

function readConditions(root, graphics, scene) {
    const pending = scene._wqaBattleConditions;
    if (!pending?.length || graphics.frameCount < scene._wqaNextConditionFrame) return [];
    const frame = graphics.frameCount || 0;
    scene._wqaNextConditionFrame = frame + 6;
    const set = scene._spriteset;
    const enemies = set?._enemySprites;
    const actors = set?._actorSprites;
    const hud = scene._statusWindow;
    const seen = scene._wqaSeenConditions ||= new WeakMap();
    const lines = [];
    scene._wqaBattleConditions = pending.filter(entry => {
        const { target, id, icon, added, speak, until } = entry;
        const tracked = seen.get(target);
        const prior = tracked?.get(id);
        const enemy = Array.isArray(enemies) && enemies.length <= MAX_RESULTS &&
            enemies.find(sprite => sprite._enemy === target);
        const actor = hud?.battler === target && Array.isArray(actors) && actors.length <= MAX_RESULTS &&
            actors.find(sprite => sprite._actor === target);
        const name = enemy ? enemyLabel(scene, enemy) :
            actor && visibleSprite(scene, hud) && portraitActor(scene, actor)?.name;
        if (!name) return false;

        if (added) {
            const label = enemy ? (enemyIconIndex(root, enemy) === icon && enemyState(root, enemy)) :
                visibleCondition(hud, graphics, id);
            if (!label) return frame < until;
            const observed = tracked || new Map();
            // Track only effects with no native recovery line.
            if (!root.$dataStates?.[id]?.message4) {
                observed.set(id, label);
                if (!tracked) seen.set(target, observed);
            }
            if (speak) lines.push(name + ', ' + label + '.');
        } else {
            if (!prior) return false;
            if (enemy ? enemyIconIndex(root, enemy) === icon : visibleCondition(hud, graphics, id)) return frame < until;
            // Shared icons stay eligible until no remaining state uses the
            // same visual. Never describe a hidden variant by its ID.
            if (enemy && target.allIcons?.().includes(icon)) {
                tracked.delete(id);
                return false;
            }
            tracked.delete(id);
            lines.push(name + ', ' + prior + ' ended.');
        }
        return false;
    });
    return lines;
}

module.exports = { readCollapses, recordCollapse, recordCondition, readConditions, recordResistance, readResistance, recordMomentum, readMomentum };
