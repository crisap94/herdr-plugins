TR.roles.strip=(t,o={})=>{
 const lane=t.lanes[0],ctx=TR.derive.maxCtx(t);
 return `<div class="strip">${TR.status(t.st,14)}<span class="hl grow ellipsis${t.need?' need':''}" data-hover="${t.hl}">${t.hl}</span>
 <span class="strip-ctx">${TR.meter(ctx,64)}<span>${ctx}%</span></span>${o.compacting?TR.pillCompacting():''}</div>`;
};
