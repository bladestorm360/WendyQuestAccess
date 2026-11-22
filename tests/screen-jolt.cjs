'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
module.exports = function(fixture, commandContext, stock) {
    const folder = path.join(stock, 'package.nw/data');
    let count = 0;
    const common = JSON.parse(fs.readFileSync(path.join(folder, 'CommonEvents.json')));
    const rows = [];
    for (const file of fs.readdirSync(folder).filter(name => /^Map\d+\.json$/.test(name))) {
        const map = JSON.parse(fs.readFileSync(path.join(folder, file)));
        for (const event of map.events || []) if(event) for(const [page,data] of event.pages.entries())
            for(const [index,row] of data.list.entries()) if(row.code === 225 || row.code === 357 && row.parameters[0] === 'ShakeScreen')
                rows.push([Number(file.slice(3,6)),event.id,page,index,row]);
    }
    for(const event of common) if(event) for(const [index,row] of event.list.entries())
        if(row.code === 357 && row.parameters[0] === 'ShakeScreen') rows.push([13,5,0,index,row,event.list]);
    for(const [m,e,p,i,row,child] of rows) {
        if(m===13 && e===5 && !child && i===63)continue; // named shout fixture
        const f=fixture(m,e,p);f.spriteset.x=f.spriteset.y=0;f.spriteset._tilemap.worldVisible=true;
        const owner=f.interpreter, interpreter=child ? {_mapId:m,_eventId:e,_list:child} : owner;
        if(child) owner._childInterpreter=interpreter;
        interpreter._index=i;interpreter.wait=()=>{};
        const c=commandContext(f);c.WendyQuestAccessScreenJolt=f.narration.jolt;
        c.PluginManager={callCommand(){}};c.Utils={extractFileName:value=>value};
        c.$gameScreen.startShake=()=>{};
        assert(c.Game_Interpreter.prototype['command'+row.code].call(interpreter,row.parameters));
        f.frame();assert.equal(f.played.length,0,'command alone never announces');
        f.spriteset.x=3;f.frame();
        const duration=row.code===225 ? row.parameters[2]/60 : Number(row.parameters[3].Duration);
        assert.equal(f.played[0]?.id,duration>1?'screen-shake':'screen-jolt',[m,e,p,i].join('/'));
        f.narration.leave(f.scene);count++;
    }
    const f=fixture(14,5,1);f.spriteset.x=f.spriteset.y=0;f.spriteset._tilemap.worldVisible=true;
    f.interpreter._index=22;f.scene._wqaPreloads=new Set([{}]);f.narration.jolt(f.scene,f.interpreter,1);
    f.spriteset.x=4;f.frame();assert.equal(f.played.length,0,'resource gate stays closed');
    console.log('Native screen jolt producers:',count,'map/common events; source-only camera changes stay silent');
};
