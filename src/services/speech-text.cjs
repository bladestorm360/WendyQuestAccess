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
            if (text && message.titleArt === true) {
                const start = message.startArt === true ? ' Start.' : '';
                text = `WendyQuest. Legend of the Four Corner Stones.${start} ${text}`;
                limit = 384;
            }
            break;
        }
        case 'splashCard': text = label(message); break;
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
        case 'fieldStatus': text = label(message); break;
        case 'mapDescription':
            limit = 512;
            text = typeof message.description === 'string' && message.description.length <= limit ? message.description : '';
            break;
        case 'mapBanner': {
            const name = label(message);
            text = name && (message.entering ? 'Entering ' + name + '.' : name);
            limit = 270;
            break;
        }
        case 'menuFocus': {
            const name = label(message);
            if (!name) return '';
            const screens = ['Menu', 'Inventory', 'Battle commands', 'Battle Bag', 'Shop', 'Purchase quantity',
                'Available rewards', 'Coupon response'];
            const screen = screens.includes(message.screen) ? message.screen : '';
            const actor = screen === 'Battle commands' && typeof message.actor === 'string' && message.actor.length <= 48 ?
                message.actor : '';
            const parts = [actor, screen, name];
            if (Number.isSafeInteger(message.quantity) && message.quantity >= 0) parts.push(String(message.quantity));
            if (Number.isSafeInteger(message.price) && message.price >= 0) {
                const currency = typeof message.currency === 'string' && message.currency.length <= 24 ?
                    message.currency.trim() : '';
                parts.push((message.totalPrice ? 'Total ' : 'Price ') + message.price + (currency ? ' ' + currency : ''));
            }
            if (message.equipped === true) parts.push('equipped');
            if (message.locked === true) parts.push('locked');
            else if (message.enabled === false) parts.push('unavailable');
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
        case 'battleLog':
            if (!Array.isArray(message.lines) || !message.lines.length || message.lines.length > 8 ||
                !message.lines.every(line => typeof line === 'string' && line.length <= 192)) return '';
            limit = 768;
            text = message.lines.map(dialogueText).filter(Boolean)
                .map(line => /[.!?]$/.test(line) ? line : line + '.').join(' ');
            break;
        case 'menuDetails':
            if (!Array.isArray(message.lines) || message.lines.length > 8 ||
                !message.lines.every(line => typeof line === 'string' && line.length <= 96)) return '';
            limit = 512;
            text = message.lines.map((line, index) =>
                index + 1 < message.lines.length && !/[.!?]$/.test(line) ? line + '.' : line).join(' ');
            break;
        case 'interactionPrompt': text = 'Interact'; break;
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
            if (message.handoff === true) offsets.push('route stops at a floor event');
            if (message.outOfReach === true) offsets.push('out of reach');
            text = message.patrolBearing === true ? offsets.join(', ') || 'Very close.' :
                name && [category, name, ...offsets].filter(Boolean).join(', ');
            break;
        }
        case 'timedDirections': {
            const heading = HEADINGS[message.direction];
            const steps = message.tiles;
            if (!heading || !Number.isInteger(steps) || steps < 1 || steps > 3) return '';
            text = `${message.alternate ? 'Alternate preview' : 'Preview'}. ${steps} ${steps === 1 ? 'step' : 'steps'} ${heading}${message.terminal ? ' to an event' : ''}. Recheck if you wait.`;
            if (message.guide) text += ' ' + label({ name: message.guide });
            break;
        }
        case 'patrolApproach':
        case 'patrolWait': {
            const heading = HEADINGS[message.direction];
            if (!heading) return '';
            const steps = message.tiles;
            text = message.kind === 'patrolWait' ? `Wait for the guard to move. Crossing is ${heading}. Timing audio is unavailable.` :
                Number.isInteger(steps) && steps > 0 && steps <= 12 ?
                    `${steps} ${heading}${message.terminal ? ' to the event' : ', then check directions'}.` : '';
            if (text && message.guide) text += ' ' + label({ name: message.guide });
            break;
        }
        case 'timedCue': {
            const heading = HEADINGS[message.direction];
            if (!heading) return '';
            if (Array.isArray(message.headings) && message.headings.length && message.headings.length <= 12) {
                const legs = [];
                for (const index of message.headings) {
                    const direction = HEADINGS[[2, 4, 6, 8][index]];
                    if (!direction) return '';
                    const last = legs[legs.length - 1];
                    if (last?.direction === direction) last.tiles++;
                    else legs.push({ direction, tiles: 1 });
                }
                const action = message.pace === 'walk' ? 'walk' : message.pace === 'dash' ? 'dash' : 'go';
                const lead = message.stopAtPocket ? message.escape ? 'Leave the patrol lane on the ping. Hold ' :
                    'Wait for the first ping. Then hold ' : (message.waiting ? 'Wait on this tile. ' : '') + 'On the ping, ' + action + ' ';
                text = lead + (message.stopAtPocket ?
                    legs.map(leg => leg.direction + ' for ' + leg.tiles + (leg.tiles === 1 ? ' tile' : ' tiles')).join(', then ') :
                    legs.length === 1 ? `${legs[0].tiles} ${legs[0].tiles === 1 ? 'tile' : 'tiles'} ${legs[0].direction}` :
                        legs.map(leg => leg.tiles + ' ' + leg.direction).join(', then ')) + '.';
            } else {
                const steps = Number.isInteger(message.tiles) && message.tiles >= 2 && message.tiles <= 3 ?
                    message.tiles + ' tiles' : '1 tile';
                text = `${message.escape ? 'Leave the patrol lane. ' : message.waiting ? 'Wait on this tile. ' :
                    message.alternate ? 'Alternate opening. ' : ''}On the ping, go ${steps} ${heading}.`;
            }
            text += message.terminal ? ' The last step triggers the event.' :
                message.stopAtPocket ? ' Switch directions when the ping moves. Keep moving until you hear safe pocket.' :
                ' Stop there and request directions again.';
            if (message.guide) text += ' ' + label({ name: message.guide });
            break;
        }
        case 'patrolLineManual': {
            const { legs } = message;
            if (!Array.isArray(legs) || !legs.length || legs.length > 8 ||
                legs.some(({ direction, tiles }) => !HEADINGS[direction] || !Number.isInteger(tiles) ||
                    tiles < 1 || tiles > 12)) return '';
            const directions = legs.map(({ direction, tiles }) => tiles + ' ' + HEADINGS[direction]);
            text = 'Wait for a ping before each leg. Hold that direction until Wendy stops. ' +
                directions.join(', then ') + '.';
            break;
        }
        case 'treasureReward': {
            const name = label(message);
            const amount = message.amount;
            if (!name || !Number.isInteger(amount) || amount < 1 || amount > 999) return '';
            text = `You got ${amount} ${name}${amount === 1 ? '' : 's'}.`;
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
            const beaconOnly = message.beaconOnly === true;
            const more = !beaconOnly && message.more;
            const parts = !beaconOnly && directions.length ? [directions.join(', ')] : [];
            const facing = HEADINGS[message.facing];
            const boundary = HEADINGS[message.boundary];
            const activate = HEADINGS[message.activate];
            const exit = label({ name: message.exit });
            const exitName = /\bexit\b/i.test(exit) ? exit : exit && 'exit to ' + exit;
            const takeExit = exitName && 'take ' + exitName;
            const prerequisite = label({ name: message.prerequisite });
            const npcBlocker = label({ name: message.npcBlocker });
            if (npcBlocker) {
                parts.push('Blocked by ' + npcBlocker);
                if (more) parts.push('More directions available');
            }
            else if (prerequisite) {
                parts.push('Route to ' + prerequisite);
                if (more) parts.push('More directions available');
                else {
                    const move = HEADINGS[message.prerequisiteMove];
                    parts.push(move ? 'Move ' + move + ' to continue' :
                        (facing ? 'Face ' + facing + ' and press' : 'Press') + ' the action button');
                    if (message.remainingActions > 0) parts.push('More steps follow');
                    parts.push(message.resumeIce ? 'Directions resume after the ice melts' :
                        'Request directions again after the passage changes');
                }
            }
            else if (more) parts.push(message.enemyBlocked === true ? 'Route ends at an enemy. More directions available' :
                'More directions available');
            else if (message.enemyBlocked === true && boundary) parts.push('Blocked by an enemy one tile ' + boundary);
            else if (takeExit && (message.useExit || message.takeExit)) {
                const move = boundary || activate || (message.bump && facing);
                if (message.reenter) parts.push(`${message.sailing ? 'Sail' : 'Walk'} off this tile and back to ${takeExit}`);
                else if (move && beaconOnly) parts.push(`Move ${move} to ${takeExit}`);
                else if (message.enter && !move)
                    parts.push((facing ? 'Face ' + facing + ' and press' : 'Press') + ' the action button to ' + takeExit);
                else {
                    const steps = [...parts];
                    if (move) {
                        const last = message.legs[message.legs.length - 1];
                        if (last && HEADINGS[last.direction] === move) {
                            directions[directions.length - 1] = `${last.tiles + 1} ${move}`;
                            steps[0] = directions.join(', ');
                        } else steps.push('1 ' + move);
                    }
                    steps.push(takeExit);
                    parts.splice(0, parts.length, steps.join(', '));
                }
            }
            else if (boundary && exit) parts.push(exitName + ' one tile ' + boundary + '. No verified onward route through this exit');
            else if (activate) {
                const next = message.manualHandoff && label({ name: message.boundaryName });
                parts.push(next ? `Move ${activate} to reach ${next}` : `Move ${activate} to activate`);
                const chase = label({ name: message.chase });
                if (chase) parts.push(chase.replace(/\.$/, ''));
            }
            else if (boundary) {
                parts.push(`${label({ name: message.boundaryName }) || 'Floor event'} one tile ${boundary}`);
                const chase = label({ name: message.chase });
                if (chase) parts.push(`Move ${boundary} to start the chase`, chase.replace(/\.$/, ''));
                else if (message.manualHandoff === true) parts.push(`Move ${boundary} to continue, then request directions again`);
            }
            else if (message.reenter === true)
                parts.push(message.sailing ? 'Sail off this tile and back to activate' : 'Walk off this tile and back to activate');
            else if (message.bump === true && facing) parts.push(`Move ${facing} to activate`);
            else if (message.enter === true && facing) parts.push(`face ${facing} and press the action button to enter`);
            else if (message.enter === true) parts.push('Press the action button to enter');
            else if (message.conversation === true && facing) parts.push(`face ${facing} and press the action button to talk`);
            else if (message.conversation === true) parts.push('Press the action button to talk');
            else if (message.board === true && facing) parts.push(`face ${facing} and press the action button`);
            else if (message.board === true) parts.push('Press the action button to board');
            else if (message.land === true) {
                parts.push('Press the action button to land');
                const discovery = label({ name: message.discovery });
                if (discovery) parts.push(`Then request walking directions to ${discovery}`);
            }
            else if (message.guideAction) parts.push(facing ? `Face ${facing} and press the action button` : 'Press the action button');
            else if (facing && !beaconOnly) parts.push(`face ${facing}`);
            const onward = !more && takeExit && (message.useExit || message.takeExit) && label({ name: message.onward });
            if (onward) parts.push(onward.replace(/\.$/, ''));
            const afterEnemy = message.enemyBlocked === true && label({ name: message.afterEnemy });
            if (afterEnemy)
                parts.push('Once clear, approach ' + afterEnemy + ' and press the action button');
            const guide = label({ name: message.guide });
            if (beaconOnly && !parts.length && !guide) {
                text = message.directionsOnly === true ? '' : name;
                break;
            }
            if (!parts.length && !beaconOnly) parts.push('you are here');
            const instructions = [guide, parts.length ? parts.join('. ') + '.' : ''].filter(Boolean).join(' ');
            text = message.directionsOnly === true ? instructions[0].toUpperCase() + instructions.slice(1) :
                name + '. ' + instructions;
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
            const body = dialogueText(message.text, true);
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
