'use strict';
// Map48 packs four disconnected rooms onto one editor canvas. These bounds
// come from exhaustive native terrain-edge components, not live reachability:
// enemies, ice, scenes and switches must never hide an otherwise local goal.
const AREAS = [[3,22,4,31],[45,58,5,21],[25,40,7,19],[27,54,20,37]];
function sharedCaveArea(root,x=root.$gamePlayer?._x,y=root.$gamePlayer?._y) {
    if(root.$gameMap?._mapId!==48 || root.$dataMap?.width!==60 || root.$dataMap.height!==60 ||
        !Number.isInteger(x)||!Number.isInteger(y))return -1;
    return AREAS.findIndex(([left,right,top,bottom])=>x>=left&&x<=right&&y>=top&&y<=bottom);
}
function localCaveObject(root,event) {
    const here=sharedCaveArea(root),there=sharedCaveArea(root,event._x,event._y);
    // All three mine sections belong to one destination set: existing
    // cross-map journeys reach their loot through Nuggedor's other entrance.
    return here<0||there<0||here===there||here>0&&there>0;
}
module.exports={sharedCaveArea,localCaveObject};
