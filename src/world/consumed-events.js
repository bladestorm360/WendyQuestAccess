'use strict';

// A current branch containing only comments/control flow/erase has no
// interaction to offer. Unknown predicates and effects always remain active.
// Cache immutable page structure, never completion state across playthroughs.
const structures=new WeakMap(),NO_EFFECT=new Set([0,108,408,657,214]);
function structure(page) {
    if(structures.has(page))return structures.get(page);
    const rows=page.list,stack=[],branches=new Map();let valid=true;
    for(let i=0;i<rows.length;i++) {
        const row=rows[i];
        if(!Number.isInteger(row.indent)||row.indent<0||row.indent>12){valid=false;break;}
        if(row.code===111)stack.push({index:i,indent:row.indent,otherwise:null});
        else if(row.code===411||row.code===412) {
            const top=stack.at(-1);
            if(!top||top.indent!==row.indent||row.code===411&&top.otherwise!==null){valid=false;break;}
            if(row.code===411)top.otherwise=i;
            else {stack.pop();branches.set(top.index,{otherwise:top.otherwise,end:i});}
        }
    }
    const result=valid&&!stack.length?branches:null;structures.set(page,result);return result;
}
function predicate(root,event,p) {
    if(p[0]===0&&[0,1].includes(p[2])) {
        const value=root.$gameSwitches?.value?.(p[1]);
        return typeof value==='boolean'?value===(p[2]===0):null;
    }
    if(p[0]===2&&[0,1].includes(p[2])&&['A','B','C','D'].includes(p[1])) {
        const value=root.$gameSelfSwitches?.value?.([root.$gameMap._mapId,event._eventId,p[1]]);
        return typeof value==='boolean'?value===(p[2]===0):null;
    }
    if(p[0]===1&&[0,1].includes(p[2])) {
        const a=root.$gameVariables?.value?.(p[1]),b=p[2]===0?p[3]:root.$gameVariables?.value?.(p[3]);
        if(!Number.isFinite(a)||!Number.isFinite(b))return null;
        return [()=>a===b,()=>a>=b,()=>a<=b,()=>a>b,()=>a<b,()=>a!==b][p[4]]?.()??null;
    }
    if(p[0]===4&&p[2]===0&&Array.isArray(root.$gameParty?._actors))
        return root.$gameParty._actors.includes(p[1]);
    return null;
}
function consumedFloorPage(root,event,page) {
    if(!page||![1,2].includes(event._trigger)||!Array.isArray(page.list)||page.list.length>1024)return false;
    const branches=structure(page);if(!branches||!branches.size)return false;
    const rows=page.list;
    function empty(start,end,depth=0) {
        if(depth>12)return false;
        for(let i=start;i<end;i++) {
            const row=rows[i];
            // Erasing a physical blocker still changes accessibility. Keep
            // that activation available even if it has no dialogue.
            if(row.code===214&&(page.priorityType===1||event.blockerProperties))return false;
            if(NO_EFFECT.has(row.code))continue;
            if(row.code===115)return true; // Native Exit Event Processing.
            if(row.code!==111)return false;
            const branch=branches.get(i),truth=predicate(root,event,row.parameters);
            if(!branch||branch.end>=end||truth===null)return false;
            if(!empty(truth?i+1:(branch.otherwise??branch.end)+1,
                truth?(branch.otherwise??branch.end):branch.end,depth+1))return false;
            i=branch.end;
        }
        return true;
    }
    return empty(0,rows.length);
}
module.exports={consumedFloorPage};
