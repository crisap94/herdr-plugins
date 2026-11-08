TR.roles.window=(t,S)=>{
 const v=TR.views[S.view](t,S),pos=TR.roles.fleet.visible({filter:new Set(),q:''}).findIndex(x=>x.id===t.id)+1;
 return `<div class="win brief"><div class="win-bar">${TR.btn('Fleet',{act:'scene',data:{k:'fleet'},icon:'back'})}<span class="crumb muted">${t.space} / <b>${t.name}</b></span><span class="grow"></span>${TR.seg(TR.C.VIEWS,S.view,'view')}<span class="grow"></span><span class="dim">${pos} of ${TR.fixtures.tabs.length}</span>${TR.btn('',{icon:'gear',title:'Settings'})}</div>
 <div class="win-body">${v}</div><div class="win-foot">${TR.roles.hints()}</div></div>`;
};
