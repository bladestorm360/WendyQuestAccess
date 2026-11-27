'use strict';

// Requested HUD/map information has its own bounded speech owner. It must
// not retire the movement job, its worker admission, or a retained journey.
function createFieldInspection(root,host,ready,notifications,read) {
    let pending=null,output=0,wakeScene=null;
    function cancel() {
        if(pending){pending.renderer.off('postrender',pending.present);pending=null;}
        if(output)notifications.close(output);
        output=0;
        wakeScene=null;
    }
    function request(scene,action) {
        if(!ready(scene,true)||!read(scene,action,true))return false;
        const renderer=host.graphics.app?.renderer;
        if(typeof renderer?.once!=='function')return false;
        cancel();
        const map=root.$gameMap,player=root.$gamePlayer;
        const valid=()=>root.$gameMap===map&&root.$gamePlayer===player&&ready(scene,true);
        const state={renderer,present(){
            if(pending!==state)return;
            pending=null;
            if(!valid())return;
            const record=read(scene,action,false);
            // Append to an admitted map-entry/walking announcement rather
            // than cancelling it in the same render frame as the key press.
            if(record)output=(notifications.continue||notifications.open)(record,valid);
        }};
        pending=state;scene._wqaPresentation=true;
        wakeScene=scene;scene._wqaNavigationWake=true;
        renderer.once('postrender',state.present);
        return true;
    }
    return {request,cancel,activity(scene){
        const accepted=wakeScene===scene&&ready(scene,true);wakeScene=null;return accepted;
    }};
}
module.exports={createFieldInspection};
