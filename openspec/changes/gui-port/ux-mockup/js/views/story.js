TR.views.story=()=>{
 const s=TR.fixtures.story;
 return `<div class="card"><div class="card-h">Session so far</div><p class="story">${s.text}</p></div>
 <div class="card chapters"><div class="card-h">Chapters</div>${s.chapters.map((c,i)=>`<div class="chapter"><span class="tick"></span><div><b>Chapter ${i+1}: ${c[0]}</b> <span class="dim">${c[1]}</span><div class="muted">${c[2]}</div></div></div>`).join('')}</div>`;
};
