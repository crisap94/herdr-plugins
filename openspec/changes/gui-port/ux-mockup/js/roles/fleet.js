(function(){
const C=TR.C,D=TR.derive;
const visible=S=>D.byUrgency(TR.fixtures.tabs).filter(t=>(!S.filter.size||S.filter.has(t.st))&&(!S.q||(t.name+t.space+t.hl).toLowerCase().includes(S.q)));
const row=(t,S)=>{
 const ctx=D.maxCtx(t),multi=t.lanes.length>1;
 return `<div class="f-item${t.id===S.sel?' sel':''}" data-act="open" data-id="${t.id}">
  <div class="f-line">${TR.status(t.st,16)}<b>${t.name}</b><span class="dim">${t.space}</span><span class="grow"></span>${t.waitMin?`<span class="wait">waiting ${t.waitMin} min</span>`:`<span class="dim">${D.ago(t.recapAgo)}</span>`}</div>
  <div class="f-hl${t.need?' need':''}">${t.hl}</div>
  <div class="f-meta">${multi?`<span class="f-lanes">${t.lanes.map(l=>TR.status(l.st,10)).join('')}2 lanes</span>`:''}${TR.meter(ctx,110)}<span>${ctx}%</span>${ctx>=C.HINT?'<span class="hintflag">compact?</span>':''}</div></div>`;
};
const list=S=>{
 let last='',h='';
 visible(S).forEach(t=>{if(t.st!==last){last=t.st;h+=`<div class="f-grp">${C.STATUS_GROUP[t.st]}</div>`}h+=row(t,S)});
 return h||'<div class="f-grp">No tabs match</div>';
};
const filters=S=>{
 const T=TR.fixtures.tabs;
 return C.STATUS_ORDER.map(s=>TR.btn(`${C.STATUS_GROUP[s]} <span class="n">${T.filter(t=>t.st===s).length}</span>`,{act:'filter',data:{k:s},pressed:S.filter.has(s),icon:s})).join('')
  +`<span class="grow"></span>`+TR.search('q','Filter tabs',S.q);
};
TR.roles.fleet=S=>{
 const T=TR.fixtures.tabs,n=s=>T.filter(t=>t.st===s).length;
 return `<div class="win fleet"><div class="win-bar"><b>Fleet</b><span class="muted">${n('blocked')} need you, ${n('working')} working</span><span class="grow"></span>${TR.btn(S.refreshing?'Refreshing':'Refresh all',{act:'refresh',icon:S.refreshing?'working':'refresh'})}${TR.btn('',{icon:'gear',title:'Settings'})}</div>
 <div class="f-filters">${filters(S)}</div><div class="f-list" id="fleet-list">${list(S)}</div>
 <div class="win-foot">${TR.roles.hints()}</div></div>`;
};
TR.roles.fleet.list=list;TR.roles.fleet.visible=visible;
TR.roles.hints=()=>TR.C.KEYS.map(([a,b,l])=>`<span>${TR.kbd(a)}${b?TR.kbd(b):''} ${l}</span>`).join('');
})();
