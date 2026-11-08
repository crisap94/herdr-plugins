(function(){
const C=TR.C,D=TR.derive,F=()=>TR.fixtures;
const flt=S=>({sections:S.tlSec,q:S.tq});
const bins=S=>D.bins(F().events.filter(e=>D.matches(e,flt(S))),C.BIN_COUNT,C.HOURS);
const pct=t=>t/(C.HOURS*60)*100;
const filters=S=>`<div class="tl-filters">${C.SECTIONS.map(k=>`<button class="btn" data-act="tlsec" data-k="${k}" aria-pressed="${S.tlSec.has(k)}"><span class="sw" style="background:${C.SECTION_COLOR[k]}"></span>${C.SECTION_LABEL[k]} <span class="n">${F().events.filter(e=>e.sec===k).length}</span></button>`).join('')}
 <div class="grow"></div>${TR.search('tq','Search events',S.tq)}${S.bin>=0?TR.btn('Clear range',{act:'binclear',icon:'close'}):''}</div>`;
const plot=S=>{
 const bs=bins(S),max=Math.max(1,...bs.map(b=>b.n));
 const bars=bs.map(b=>`<button class="tl-bin${S.bin===b.i?' sel':''}" data-act="bin" data-bin="${b.i}" data-hover-kind="bin" aria-label="${b.n} events"><i style="height:${b.n?Math.max(6,b.n/max*64):0}px;background:${C.SECTION_COLOR[b.dominant]}"></i></button>`).join('');
 const marks=F().breaks.map(b=>`<div class="tl-mark ${b.kind}" style="left:${pct(b.t)}%"><span>${b.short}</span></div>`).join('');
 const ax=[],off=((6-((D.ms(0)/3600000)%24)%6)%6)*60;
 for(let t=off;t<=C.HOURS*60;t+=360){const c=D.clock(t),mid=c==='00:00';ax.push(`<span class="${mid?'day':''}" style="left:${pct(t)}%">${mid?D.weekday(t)+' '+D.day(t):c}</span>`)}
 return `<div class="tl"><div class="tl-plot"><div class="tl-marks">${marks}</div><div class="tl-bins" style="--n:${C.BIN_COUNT}">${bars}</div><div class="tl-now"></div></div>
 <div class="tl-axis">${ax.join('')}<span class="now" style="left:100%">now</span></div></div>`;
};
const feed=S=>{
 const bin=S.bin>=0?bins(S)[S.bin]:null,f=D.feed(F().events,F().breaks,{...flt(S),bin});
 const rows=f.rows.map(r=>r.type==='day'?`<div class="f-day">${r.label}</div>`
  :r.type==='break'?`<div class="f-break ${r.b.kind}">${TR.icon(C.BREAK_ICON[r.b.kind],14)}<span>${D.clock(r.t)}</span><b>${C.BREAK_LABEL[r.b.kind]}</b><span>${r.b.text}</span></div>`
  :`<div class="f-row"><span class="t">${D.clock(r.t)}</span><span class="tag" style="color:${C.SECTION_COLOR[r.e.sec]}">${C.SECTION_LABEL[r.e.sec]}</span><span class="grow">${r.e.text}</span></div>`).join('');
 const range=bin?` in ${D.day(bin.t0)} ${D.clock(bin.t0)}-${D.clock(bin.t1)}`:'';
 return `<div class="f-sum">${f.count} events${range}. Hover a bar to preview, click it to filter the list.</div><div class="feed">${rows||'<div class="f-day">No events match</div>'}</div>`;
};
TR.views.timeline=(t,S)=>filters(S)+`<div id="tl-plot">${plot(S)}</div><div id="tl-feed">${feed(S)}</div>`;
TR.views.timeline.plot=plot;TR.views.timeline.feed=feed;TR.views.timeline.bins=bins;
TR.hover.providers.bin=el=>{
 const b=TR.views.timeline.bins(TR.state)[+el.dataset.bin];
 const rows=b.events.slice(-4).reverse().map(e=>`<div><span style="color:${C.SECTION_COLOR[e.sec]}">${C.SECTION_LABEL[e.sec]}</span> ${e.text}</div>`).join('');
 return `<div class="k">${D.weekday(b.t0)} ${D.day(b.t0)}, ${D.clock(b.t0)}-${D.clock(b.t1)}</div><b>${b.n} event${b.n===1?'':'s'}</b>${rows}${b.n>4?`<div class="k">+${b.n-4} more, click to filter</div>`:''}`;
};
})();
