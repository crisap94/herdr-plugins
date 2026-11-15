(function(){
const D=()=>TR.derive;
const list=(a,empty)=>a.length?`<ul class="list">${a.map(x=>`<li>${x}</li>`).join('')}</ul>`:`<span class="dim">${empty}</span>`;
const title=(t,S)=>`<div class="brief-head"><div class="grow"><div class="row-flex"><h3 class="title">${t.name}</h3>${TR.pill(t.st)}</div><div class="goal">Goal: ${t.goal}</div></div>
 <span class="dim">recap ${D().ago(t.recapAgo)}</span>${TR.btn(S.refreshing?'Refreshing':'Refresh',{act:'refresh',icon:S.refreshing?'working':'refresh'})}</div>`;
const banner=(t,S)=>{
 const s=D().since(t,S.lastSeen[t.id]),b=n=>`<b>${n}</b>`;
 const parts=[s.need&&`${b(s.need)} need open`,s.dec&&`${b(s.dec)} new decision${s.dec>1?'s':''}`,s.fact&&`${b(s.fact)} progress update${s.fact>1?'s':''}`,s.comp&&`compacted ${b(s.comp+'x')}`].filter(Boolean);
 return `<div class="banner">${TR.icon('history',16)}<span>Since you last looked (${D().ago(s.seen)}):</span><span>${parts.length?parts.join(' · '):'nothing new'}</span></div>`;
};
const need=t=>!t.need?'':`<div class="card need"><div class="card-h">${TR.icon('clock',14)}Waiting ${t.waitMin} min</div>
 <div class="q">${t.need.q}</div><ul class="options">${t.need.options.map(o=>`<li>${o}</li>`).join('')}</ul>
 <div class="actions">${TR.btn('Jump to lane',{primary:1,icon:'jump',act:'jump'})}<label class="input grow"><input id="reply" placeholder="Reply to the agent"></label>${TR.btn('Send',{icon:'send',act:'send'})}</div></div>`;
const now=t=>`<div class="card"><div class="card-h">Now</div>${list(t.now,'Nothing running.')}</div>`;
const decs=t=>`<div class="card"><div class="card-h">Decisions</div>${t.decs.length?t.decs.map(d=>`<details class="dec"><summary><span class="tick"></span><span class="grow">${d.title}</span><span class="dim">${D().ago(d.ago)}</span></summary><div class="why">${d.why}</div></details>`).join(''):'<span class="dim">None yet.</span>'}</div>`;
const next=t=>`<div class="card"><div class="card-h">Next</div>${list(t.next,'Nothing planned.')}${t.links.length?`<div class="links">${t.links.map(l=>TR.chip(l,'link')).join('')}</div>`:''}</div>`;
TR.views.brief=(t,S)=>title(t,S)+`<div class="lanes">${t.lanes.map((l,i)=>TR.laneChip(l,i,S)).join('')}</div>`+banner(t,S)
 +`<div class="brief-grid"><div class="col">${need(t)}${now(t)}</div><div class="col">${decs(t)}${next(t)}</div></div>`;
})();
