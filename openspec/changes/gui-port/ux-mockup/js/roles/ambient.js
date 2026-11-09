TR.roles.ambient=S=>{
 const T=TR.fixtures.tabs,api=T[0],jobs=T[2];
 const tab=(t,a)=>`<div class="tab${a?' act':''}">${TR.status(t.st,14)}${t.name.split(' ')[0].toLowerCase()}</div>`;
 const spaces=['shop','infra','docs'].map((s,i)=>`<div class="space${i?'':' act'}"><span class="ic">${s[0].toUpperCase()}</span>${s}</div>`).join('');
 return `<div class="app"><div class="side"><div class="side-h">Spaces</div>${spaces}</div>
 <div class="main"><div class="tabbar">${tab(api,1)}${tab(T[1])}${tab(jobs)}</div>
 <div class="panes">
  <div class="pane">${TR.roles.strip(api)}<div class="term"><span class="p">~/shop-api</span> $ claude<br>Tests pass for line rounding.<br>I need a decision: round per line or on the total when two currencies share a cart?<br><span class="wait">waiting for you, 14 min</span></div></div>
  <div class="pane">${TR.roles.strip(jobs,{compacting:1})}<div class="term"><span class="p">~/infra</span> $ claude<br>Applying 14 migrations (dry run)<br>9 of 14 done.</div></div>
 </div>
 <div class="statusbar"><span>This computer, ${T.length} agents</span>${TR.roles.chip(T)}</div></div></div>`;
};
