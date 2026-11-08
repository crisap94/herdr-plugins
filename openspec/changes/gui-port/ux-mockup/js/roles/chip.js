TR.roles.chip=tabs=>{
 const n=st=>tabs.filter(t=>t.st===st).length,worst=TR.C.STATUS_ORDER.find(s=>n(s))||'idle',b=n('blocked');
 return `<button class="bar-chip${b?' alert':''}" data-act="scene" data-k="fleet">${TR.status(worst,14)}<b>${b} need${b===1?'s':''} you</b><span>${n('working')} working</span></button>`;
};
