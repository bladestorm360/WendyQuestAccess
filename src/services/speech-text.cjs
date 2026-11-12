'use strict';

const { dialogueText } = require('./dialogue-icons.cjs');
const MAX_TEXT = 256;
const HEADINGS = Object.freeze({ 2: 'south', 4: 'west', 6: 'east', 8: 'north' });
const fileControls = Object.freeze({ options: 'Options', moreGames: 'More games', coupons: 'Coupons' });

function label(message) {
    return typeof message.name === 'string' && message.name.length <= MAX_TEXT ? message.name : '';
}

function describeSlot(message, prefix) {
    if (!Number.isInteger(message.slot) || message.slot < 1 || message.slot > 3) return '';
    const parts = [...prefix, `Save slot ${message.slot}`];
    if (message.empty) return [...parts, 'Start new game'].join(', ');
    if (Number.isInteger(message.level) && message.level > 0) parts.push(`Level ${message.level}`);
    if (typeof message.playtime === 'string' && message.playtime.length <= 32 && message.playtime) {
        parts.push(`Playtime ${message.playtime}`);
    }
    if (Number.isInteger(message.critHits) && message.critHits >= 0) parts.push(`Critical hits ${message.critHits}`);
    if (Number.isInteger(message.critStreak) && message.critStreak >= 0) {
        parts.push(`Longest critical streak ${message.critStreak}`);
    }
    if (message.combined) parts.push('Combined cornerstone symbol');
    else if (Number.isInteger(message.stones) && message.stones > 0 && message.stones <= 4) {
        parts.push(message.stones === 1 ? '1 cornerstone' : `${message.stones} cornerstones`);
    }
    if (Array.isArray(message.party)) {
        const party = message.party.slice(0, 5).filter(name => typeof name === 'string' && name.length <= 48);
        if (party.length) parts.push(`Party: ${party.join(', ')}`);
    }
    return parts.join(', ');
}

function formatSpeech(message) {
    let text;
    let limit = MAX_TEXT;
    switch (message.kind) {
        case 'title': {
            const name = label(message);
            text = name && (message.enabled ? name : `${name}, unavailable`);
            break;
        }
        case 'saveSlot': text = describeSlot(message, []); break;
        case 'saveAction': {
            const name = label(message);
            text = name && (message.summary ? describeSlot(message, [name]) : name);
            break;
        }
        case 'fileControl':
            text = Object.prototype.hasOwnProperty.call(fileControls, message.label) ? fileControls[message.label] : '';
            break;
        case 'fileLabel':
        case 'controllerStatus':
        case 'fieldStatus':
        case 'mapBanner': text = label(message); break;
        case 'menuFocus': {
            const name = label(message);
            if (!name) return '';
            const parts = [message.screen === 'Menu' || message.screen === 'Inventory' ? message.screen : '', name];
            if (Number.isSafeInteger(message.quantity) && message.quantity >= 0) parts.push(String(message.quantity));
            if (message.equipped === true) parts.push('equipped');
            if (message.enabled === false) parts.push('unavailable');
            if (message.indexed && message.position > 0 && message.position <= message.total &&
                Number.isInteger(message.total) && message.total <= 256) parts.push(`${message.position} of ${message.total}`);
            text = parts.filter(Boolean).join(', ');
            break;
        }
        case 'menuReview':
            text = label(message);
            if (text && message.indexed && message.position > 0 && message.position <= message.total &&
                Number.isInteger(message.total) && message.total <= 8) text += `, ${message.position} of ${message.total}`;
            break;
        case 'questFocus': {
            const name = label(message) || 'Quest objective';
            const objective = typeof message.objective === 'string' && message.objective.length <= 96 ? message.objective : '';
            text = [name, objective].filter(Boolean).join('. ');
            break;
        }
        case 'menuDetails':
            if (!Array.isArray(message.lines) || message.lines.length > 8 ||
                !message.lines.every(line => typeof line === 'string' && line.length <= 96)) return '';
            limit = 512;
            text = message.lines.join('. ');
            break;
        case 'fieldTarget': {
            const name = label(message);
            const category = typeof message.category === 'string' && message.category.length <= 32 ? message.category : '';
            const offsets = [];
            if (Number.isInteger(message.dx) && message.dx && Math.abs(message.dx) < 256) {
                offsets.push(`${Math.abs(message.dx)} ${message.dx < 0 ? 'west' : 'east'}`);
            }
            if (Number.isInteger(message.dy) && message.dy && Math.abs(message.dy) < 256) {
                offsets.push(`${Math.abs(message.dy)} ${message.dy < 0 ? 'north' : 'south'}`);
            }
            if (message.outOfReach === true) offsets.push('out of reach');
            text = name && [category, name, ...offsets].filter(Boolean).join(', ');
            break;
        }
        case 'timedDirections': {
            const heading = HEADINGS[message.direction];
            const steps = message.tiles;
            if (!heading || !Number.isInteger(steps) || steps < 1 || steps > 3) return '';
            text = `${message.alternate ? 'Alternate preview' : 'Preview'}. ${steps} ${steps === 1 ? 'step' : 'steps'} ${heading}${message.terminal ? ' to an event' : ''}. Recheck if you wait.`;
            break;
        }
        case 'timedCue': {
            const heading = HEADINGS[message.direction];
            if (!heading) return '';
            text = `${message.alternate ? 'Alternate opening. ' : ''}One tile ${heading}${message.terminal ? ' to an event' : ''} on the tone.`;
            break;
        }
        case 'routeDirections': {
            const name = label(message);
            if (!name || !Array.isArray(message.legs) || message.legs.length > 8) return '';
            const directions = [];
            for (const leg of message.legs) {
                const heading = HEADINGS[leg.direction];
                if (!heading || !Number.isInteger(leg.tiles) || leg.tiles < 1 || leg.tiles > 16384) return '';
                directions.push(`${leg.tiles} ${heading}`);
            }
            const parts = directions.length ? [directions.join(', ')] : [];
            const facing = HEADINGS[message.facing];
            const boundary = HEADINGS[message.boundary];
            const activate = HEADINGS[message.activate];
            if (message.more) parts.push('More directions available');
            else if (activate) parts.push(`Move ${activate} to activate`);
            else if (boundary) parts.push(`${label({ name: message.boundaryName }) || 'Floor event'} one tile ${boundary}`);
            else if (message.reenter === true)
                parts.push(message.sailing ? 'Sail off this tile and back to activate' : 'Walk off this tile and back to activate');
            else if (message.enter === true && facing) parts.push(`face ${facing} and press the action button to enter`);
            else if (message.enter === true) parts.push('Press the action button to enter');
            else if (message.board === true && facing) parts.push(`face ${facing} and press the action button`);
            else if (message.board === true) parts.push('Press the action button to board');
            else if (message.land === true) {
                parts.push('Press the action button to land');
                const discovery = label({ name: message.discovery });
                if (discovery) parts.push(`Then request walking directions to ${discovery}`);
            }
            else if (facing) parts.push(`face ${facing}`);
            if (!parts.length) parts.push('you are here');
            text = `${name}. ${parts.join('. ')}.`;
            limit = 512;
            break;
        }
        case 'optionTab': {
            const name = label(message);
            text = name && `${name} tab`;
            break;
        }
        case 'optionValue': {
            const name = label(message);
            const tab = typeof message.tab === 'string' && message.tab.length <= 96 ? message.tab : '';
            const value = Number.isInteger(message.pips) && message.pips >= 0 && message.pips <= 10
                ? `${message.pips} of 10${message.pips === 0 ? ', muted' : ''}`
                : typeof message.status === 'string' && message.status.length <= 96 ? message.status : '';
            text = name && [tab, name, value, message.enabled ? '' : 'unavailable'].filter(Boolean).join(', ');
            break;
        }
        case 'retryOption': {
            const name = label(message);
            text = name && [message.summary ? 'Game over' : '', message.tryAgain ? 'Try again?' : '', name]
                .filter(Boolean).join(' ');
            break;
        }
        case 'dialoguePage': {
            const body = dialogueText(message.text);
            const speaker = typeof message.speaker === 'string' && message.speaker.length <= 96 ? message.speaker.trim() : '';
            text = body && (speaker ? `${speaker}. ${body}` : body);
            limit = 512;
            break;
        }
        case 'dialogueChoice': {
            const choice = dialogueText(message.text);
            text = message.first ? (choice ? `Choices. ${choice}` : 'Choices') : choice;
            limit = 512;
            break;
        }
        case 'numberEntry': {
            const { position, length, digit, digits, first } = message;
            if (!Number.isInteger(position) || !Number.isInteger(length) || length < 1 || length > 16 ||
                position < 1 || position > length || typeof digit !== 'string' || !/^[0-9]$/.test(digit)) return '';
            const focus = `Digit ${position} of ${length}, ${digit}`;
            text = first && typeof digits === 'string' && /^[0-9]{1,16}$/.test(digits) && digits.length === length
                ? `Number entry. ${digits.split('').join(', ')}. ${focus}` : focus;
            break;
        }
        case 'deletePrompt': {
            const name = label(message);
            text = name && `${name}? Choose Delete or Cancel`;
            break;
        }
        default: return '';
    }
    // Framing stays local to the worker. No game string can create a new line
    // on the speech pipe, and UTF-8 conversion remains outside the renderer.
    const announcement = message.loadFailed ? `Could not load the save. ${text}` : text;
    return announcement.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, limit);
}

module.exports = { formatSpeech };
