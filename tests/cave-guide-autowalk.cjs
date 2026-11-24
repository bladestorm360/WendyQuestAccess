'use strict';
const assert=require('node:assert/strict');
function verify(h) {
    const {c,field,preferences,start,tick,ask,records,accepted}=h;
    preferences.autowalk=true;preferences.caveAutomaticInteractions=false;
    const cases=[
        [196,11,49,4,40,20], [199,1,33,0,26,26], [200,9,33,0,26,11],
        [201,6,44,0,39.25,2], [202,8,20,0,14,4]
    ];
    for(const [map,x,y,vx,vy,target] of cases) {
        records.length=accepted.length=h.diagnostics.length=0;
        start(map,x,y,vx,vy);
        if(map===200){c.$gameVariables.setValue(90,2);c.$gameSwitches.setValue(587,true);c.$gameMap.refreshIfNeeded();}
        // The actual command must wake the native idle branch before render.
        c.$gameMap.inactiveTime=30;
        assert(field.command('puzzleGuide'),'Shift+G must be accepted after native idle');
        assert(field.idleInput(h.getScene()),'Shift+G supplies the existing native activity receipt');
        c.$gameMap.inactiveTime=0;
        field.stepReady(h.getScene()); // Existing native post-update handback.
        h.render();
        for(let frame=0;frame<8 && !field.autowalk.active(h.getScene());frame++)tick();
        assert(field.autowalk.active(h.getScene()),'Shift+G must start Autowalk on cave map '+map+' with full solving off '+JSON.stringify({records,diagnostics:h.diagnostics}));
        for(let frame=0;frame<20000 && !(map===202 ? c.$gameMap._interpreter._eventId>=5 && c.$gameMap._interpreter._eventId<=11 : c.$gameMap._interpreter._eventId===target);frame++)tick();
        const actual=c.$gameMap._interpreter._eventId;
        assert(map===202 ? actual>=5&&actual<=11 : actual===target,JSON.stringify({map,actual,at:[c.$gamePlayer.x,c.$gamePlayer.y],records:records.slice(-4),diagnostics:h.diagnostics.slice(-5)}));
        assert(!records.some(row=>/unavailable|Autowalk stopped|not currently reachable/i.test(row.name||'')));
        if(map===201) {
            assert.deepEqual(accepted.filter(id=>id!==2),[4,9,11,13,24,26,27,28,29]);
            assert.deepEqual([c.$gamePlayer.x,c.$gamePlayer.y],[20,0]);
            assert(!records.some(row=>row.activate||row.manualHandoff));
        }
        assert(!c.Graphics._wqaCaveSolverActive,'Ordinary guidance does not enable full collection');
    }
    preferences.autowalk=false;records.length=accepted.length=0;
    start(201,6,44,0,39.25);ask('puzzleGuide');
    assert(!field.autowalk.active(h.getScene()));
    assert(records.some(row=>/^\d+ (north|south|east|west)\.$/.test(row.name||'')),'Manual chase instructions remain concise');
    console.log('Shift+G honors Autowalk in all five cave rooms with full solving off, wakes after idle, preserves manual boundaries, reaches every chase event/final exit and retains manual guidance.');
}
module.exports={verify};
