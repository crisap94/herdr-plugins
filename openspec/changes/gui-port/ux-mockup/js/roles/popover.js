(function(){
const C=TR.C;
TR.roles.popover=lane=>{
 const hint=lane.ctx>=C.HINT;
 return `<div class="pop" id="pop" role="dialog" aria-label="Compact ${lane.name}"><h4>Compact ${lane.name}</h4>
 <div class="pop-hint${hint?' warn':''}">${TR.icon(hint?'bolt':'clock',14)}${lane.ctx}% of ${C.CTX_WINDOW} used${hint?`, past the ${C.HINT}% hint`:`, below the ${C.HINT}% hint`}</div>
 <textarea id="note" maxlength="${C.NOTE_MAX}" placeholder="Optional note: what the agent should keep in mind after compaction"></textarea>
 <div class="pop-foot"><span class="dim" id="cnt">0 / ${C.NOTE_MAX}</span><span class="row-flex">${TR.btn('Cancel',{act:'cancel'})}${TR.btn('Compact',{primary:1,act:'go'})}</span></div></div>`;
};
TR.roles.popover.place=(pop,anchor)=>{
 const r=anchor.getBoundingClientRect(),w=pop.offsetWidth,h=pop.offsetHeight;
 let left=r.left;if(left+w>innerWidth-12)left=r.right-w;
 let top=r.bottom+8;if(top+h>innerHeight-12)top=r.top-h-8;
 pop.style.left=Math.max(12,left)+'px';pop.style.top=Math.max(12,top)+'px';
};
TR.roles.toast=lane=>`<b>${TR.icon('done',16)}Compacted, 78% to 21%</b><span class="muted">${lane.name} · 43 s</span><div>${TR.btn('Jump to lane',{primary:1,icon:'jump',act:'jump'})}</div>`;
})();
