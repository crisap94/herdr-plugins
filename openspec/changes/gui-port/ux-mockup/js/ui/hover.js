TR.hover={providers:{}};
TR.hover.init=()=>{
 const card=document.getElementById('hover');
 const hide=()=>{card.style.display='none'};
 const show=(el,x,y)=>{
  const p=el.dataset.hoverKind&&TR.hover.providers[el.dataset.hoverKind];
  card.innerHTML=p?p(el):`<div>${el.dataset.hover}</div>`;
  card.style.display='block';
  const w=card.offsetWidth,h=card.offsetHeight;
  card.style.left=Math.max(8,Math.min(x+14,innerWidth-w-8))+'px';
  card.style.top=(y-h-14<8?y+18:y-h-14)+'px';
 };
 document.addEventListener('mousemove',e=>{const el=e.target.closest&&e.target.closest('[data-hover],[data-hover-kind]');el?show(el,e.clientX,e.clientY):hide()});
 document.addEventListener('mouseleave',hide);
};
TR.hover.showAt=(el)=>{const r=el.getBoundingClientRect(),c=document.getElementById('hover');
 const p=el.dataset.hoverKind&&TR.hover.providers[el.dataset.hoverKind];
 c.innerHTML=p?p(el):`<div>${el.dataset.hover}</div>`;c.style.display='block';
 c.style.left=Math.min(r.left+20,innerWidth-c.offsetWidth-8)+'px';c.style.top=(r.top-c.offsetHeight-8<8?r.bottom+8:r.top-c.offsetHeight-8)+'px'};
