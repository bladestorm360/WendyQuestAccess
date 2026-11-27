'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {DEFAULT_KEYS}=require('../src/settings/keyboard');
const {DEFAULTS,normalizeNavigation}=require('../src/settings/navigation-keys');
const {CONTROLLER_DEFAULTS,buttonName}=require('../src/settings/controller-bindings');
const text=fs.readFileSync('README.md','utf8');
assert.deepEqual([...text.matchAll(/^## (.+)$/gm)].map(m=>m[1]),['Purpose','Known Issues','Install','Keys','Credits']);
assert.match(text,/NVDA\+Space bar/);assert.match(text,/Play with NVDA in focus mode/);
assert(!/secret ending|Secret Island|Salt Caverns|Frydusa|Frygor|Crispy Beach|Cauldron|color order|terrain crystals|mech guards/i.test(text));
const key=value=>value.replace('Arrow','').replace('\\','Backslash');
for(const [action,binding]of Object.entries(DEFAULT_KEYS))assert(text.includes(key(binding)),action+': '+binding);
for(const layout of Object.keys(DEFAULTS))for(const [action,binding]of Object.entries(normalizeNavigation().bindings[layout]))
 assert(text.includes(key(binding)),layout+'/'+action+': '+binding);
for(const binding of Object.values(CONTROLLER_DEFAULTS).flat()){
 if(typeof binding!=='number')continue;
 const name=buttonName('xbox',binding);
 assert(text.includes(name)||{'Right stick up':'Right stick up/down','Right stick down':'Right stick up/down',
  'D-pad up':'D-pad up/down','D-pad down':'D-pad up/down','D-pad left':'D-pad left/right','D-pad right':'D-pad left/right',
  'L3':'Both stick clicks','R3':'Both stick clicks' }[name]&&text.includes({'Right stick up':'Right stick up/down','Right stick down':'Right stick up/down',
  'D-pad up':'D-pad up/down','D-pad down':'D-pad up/down','D-pad left':'D-pad left/right','D-pad right':'D-pad left/right','L3':'Both stick clicks','R3':'Both stick clicks'}[name]),name);
}
assert.match(text,/releases\/latest\/download\/WendyQuestAccessSetup\.exe/);
assert.match(text,/Both actions work offline/);assert.match(text,/current installation downloads no package/);
console.log('ReadMe: FFPR heading order, features first, every default keyboard/controller input, NVDA focus mode, online/offline instructions and no named puzzle/ending exposition pass.');
