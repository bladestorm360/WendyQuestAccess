"use strict";
const assert=require('node:assert/strict');
const {formatSpeech}=require('../src/services/speech-text.cjs');
const base={kind:'routeDirections',name:'Chest',directionsOnly:true,puzzleGuidance:true,
 legs:[{direction:8,tiles:3},{direction:4,tiles:2}],facing:2,prerequisite:'Terrain crystal 2',
 remainingActions:5,guide:'Salt Caverns. 0 of 4 chests collected. Follow the terrain-crystal route.'};
const full=formatSpeech(base);
assert(full.startsWith('3 north, 2 west. Route to Terrain crystal 2.'));
assert(full.indexOf('0 of 4')>full.indexOf('press the action button'));
const brief=formatSpeech({...base,verbosePuzzleGuidance:false});
assert.equal(brief,'3 north, 2 west. Route to Terrain crystal 2. Face south and press the action button.');
assert(!/Salt Caverns|of 4|More steps|Request directions/.test(brief));
const ordinary=formatSpeech({...base,puzzleGuidance:false});assert(ordinary.startsWith('Salt Caverns.'));
const pickup={...base,prerequisite:undefined,remainingActions:undefined,guideAction:true,
 guideRequired:true,verbosePuzzleGuidance:false,guide:'Open the barrel, then move 1 north.'};
assert(formatSpeech(pickup).endsWith('Open the barrel, then move 1 north.'));
const timed={kind:'timedCue',puzzleGuidance:true,verbosePuzzleGuidance:false,direction:4,
 headings:[1,3,3,2],stopAtPocket:true,waiting:true,guide:'Long solution explanation.'};
assert.equal(formatSpeech(timed),formatSpeech({...timed,guide:undefined}));
assert.match(formatSpeech(timed),/Wait for the first ping.*west.*north.*east.*Release movement at the thud/);
assert.match(formatSpeech({...timed,kind:'patrolWait'}),/^Wait for the guard to move/);
const wait=formatSpeech({...base,legs:[],prerequisiteMove:8,verbosePuzzleGuidance:false});
assert.match(wait,/Move north to continue/);
console.log('Verified full puzzle directions before progress, brief current-step/action only, preserved guard wait/stop and pickup retreat, and unchanged ordinary gate-first speech.');
