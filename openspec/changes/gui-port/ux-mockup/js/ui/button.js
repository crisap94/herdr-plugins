TR.btn=(label,o={})=>{
 const d=Object.entries(o.data||{}).map(([k,v])=>` data-${k}="${v}"`).join('');
 const p=o.pressed===undefined?'':` aria-pressed="${o.pressed}"`;
 return `<button class="btn ${o.cls||''}${o.primary?' primary':''}${label?'':' icon'}"${o.act?` data-act="${o.act}"`:''}${d}${p}${o.title?` title="${o.title}" aria-label="${o.title}"`:''}>${o.icon?TR.icon(o.icon,14):''}${label||''}</button>`;
};
TR.kbd=k=>`<kbd class="kbd">${k}</kbd>`;
TR.seg=(items,active,act)=>`<div class="seg" role="tablist">${items.map(([k,l])=>`<button role="tab" aria-selected="${k===active}" data-act="${act}" data-k="${k}">${l}</button>`).join('')}</div>`;
TR.search=(id,ph,val)=>`<label class="input">${TR.icon('search',14)}<input id="${id}" placeholder="${ph}" value="${val||''}" autocomplete="off"></label>`;
