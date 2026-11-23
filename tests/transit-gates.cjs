'use strict';
const assert=require('node:assert/strict');
const {CHILLCREST_RETURNS,transferState,gateAllows}=require('../src/world/transfer-gates.cjs');
const {catalogTransferOptions,transferOptions}=require('../src/world/transfer-events.cjs');
module.exports=(c,load,read)=>{
 const prior=c.$gameParty._actors,members=c.$gameParty.members;
 let checks=0;
 try {
  for(const [states,actors,expectedPage,expected] of [
   [{},[],0,[false,false,false]],
   [{switches:[33]},[],0,[true,true,true]],
   [{switches:[33],variables:{10:1}},[],1,[false,false,false]],
   [{switches:[33],variables:{10:2}},[],2,[false,false,false]],
   [{switches:[33],variables:{10:3}},[],3,[false,false,false]],
   [{variables:{10:4}},[],4,[true,true,true]],
   [{variables:{10:2},self:['25,14,D']},[],null,[true,false,false]],
   [{variables:{10:2}},[4],6,[true,true,true]]]) {
    c.$gameParty._actors=actors;c.$gameParty.members=()=>actors;
    const f=load(25,states),state=transferState(c);
    for(const [n,id]of [14,18,19].entries()) {
     const e=f.gameMap.event(id),entry=f.map.events[id];
     assert.equal(e._pageIndex,expectedPage??(id===14?5:2),'original native page precedence');
     assert.equal(gateAllows(CHILLCREST_RETURNS[id],state),expected[n]);
     const edges=catalogTransferOptions(25,entry,c.$dataCommonEvents);
     assert.equal(edges.length,1);assert.equal(edges[0].gate,CHILLCREST_RETURNS[id]);
     assert.deepEqual([edges[0].map,edges[0].x,edges[0].y],[113,12,17]);
     const live=transferOptions(25,entry,e.page(),c.$dataCommonEvents).filter(edge=>gateAllows(edge.gate,state));
     assert.equal(live.length>0,expected[n],'actual active producer agrees with graph gate');checks++;
    }
  }
 }finally {if(prior===undefined)delete c.$gameParty._actors;else c.$gameParty._actors=prior;c.$gameParty.members=members;}
 console.log(`Verified ${checks} original native Chillcrest page/state/graph gate combinations.`);
};
