'use strict';

const MAX_TEXT = 256;
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
        case 'mapBanner': text = label(message); break;
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
    return announcement.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, MAX_TEXT);
}

module.exports = { formatSpeech };
