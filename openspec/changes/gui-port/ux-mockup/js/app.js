(function(){
const C=TR.C,$=s=>document.querySelector(s);
const S=TR.state={scene:'fleet',sel:'api',view:'brief',filter:new Set(),q:'',lane:-1,run:-1,bin:-1,tlSec:new Set(),tq:'',theme:'dark',refreshing:false,lastSeen:{...TR.fixtures.lastSeen}};
let timer=null;
const tab=()=>TR.fixtures.tabs.find(t=>t.id===S.sel);
const active=()=>S.scene==='fleet'?'fleet':S.view==='timeline'?'timeline':S.lane>=0?'compact':'brief';
const scenes=()=>C.SCENES.map(([k,l],i)=>TR.btn(`${i+1} ${l}`,{act:'scene',data:{k},pressed:active()===k})).join(' ');
function render(){
 $('#ambient').innerHTML=TR.roles.ambient(S);
 $('#scenes').innerHTML=scenes();
 $('#window').innerHTML=S.scene==='fleet'?TR.roles.fleet(S):TR.roles.window(tab(),S);
 document.querySelectorAll('#pop').forEach(p=>p.remove());
 const lane=tab().lanes[S.lane];
 if(lane&&S.run<0&&S.scene!=='fleet'){
  document.body.insertAdjacentHTML('beforeend',TR.roles.popover(lane));
  const pop=$('#pop'),chip=document.querySelectorAll('.lane')[S.lane];
  TR.roles.popover.place(pop,chip);
 }
}
function go(scene){
 S.scene=scene==='fleet'?'fleet':'brief';S.lane=-1;S.run=-1;S.bin=-1;stop();
 if(scene==='brief')S.view='brief';
 if(scene==='timeline')S.view='timeline';
 if(scene==='compact'){S.sel='jobs';S.view='brief';S.lane=0}
 render();
}
function stop(){clearInterval(timer);timer=null}
function startCompact(){
 S.run=0;render();
 timer=setInterval(()=>{S.run++;
  if(S.run>=C.STEPS.length){stop();const l=tab().lanes[S.lane];l.ctx=21;S.run=-1;S.lane=-1;render();toast(l);return}
  render()},C.STEP_MS);
}
function toast(lane){const t=$('#toast');t.innerHTML=TR.roles.toast(lane);t.classList.add('show');setTimeout(()=>t.classList.remove('show'),C.TOAST_MS)}
function refresh(){S.refreshing=true;render();setTimeout(()=>{S.refreshing=false;render()},C.REFRESH_MS)}
function move(d){
 const v=TR.roles.fleet.visible({filter:new Set(),q:''}),i=v.findIndex(x=>x.id===S.sel),n=v[i+d];
 if(n){S.sel=n.id;S.lane=-1;S.run=-1;render()}
}
const acts={
 scene:el=>go(el.dataset.k),
 view:el=>{S.view=el.dataset.k;S.lane=-1;S.bin=-1;render()},
 open:el=>{S.sel=el.dataset.id;S.scene='brief';S.view='brief';S.lane=-1;render()},
 filter:el=>{const k=el.dataset.k;S.filter.has(k)?S.filter.delete(k):S.filter.add(k);render()},
 compact:el=>{const i=+el.dataset.lane;S.lane=S.lane===i&&S.run<0?-1:i;S.run=-1;render()},
 cancel:()=>{S.lane=-1;render()},
 go:startCompact,
 refresh:refresh,
 tlsec:el=>{const k=el.dataset.k;S.tlSec.has(k)?S.tlSec.delete(k):S.tlSec.add(k);S.bin=-1;render()},
 bin:el=>{const i=+el.dataset.bin;S.bin=S.bin===i?-1:i;timelineParts()},
 binclear:()=>{S.bin=-1;render()},
 jump:()=>{},send:()=>{}
};
function timelineParts(){
 const t=tab();
 $('#tl-plot').innerHTML=TR.views.timeline.plot(S);$('#tl-feed').innerHTML=TR.views.timeline.feed(S);
 document.querySelectorAll('[data-act=binclear]').forEach(b=>b.remove());
 if(S.bin>=0)$('.tl-filters').insertAdjacentHTML('beforeend',TR.btn('Clear range',{act:'binclear',icon:'close'}));
}
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-act]');
 if(el&&acts[el.dataset.act]){acts[el.dataset.act](el);return}
 if(S.lane>=0&&S.run<0&&!e.target.closest('#pop')){S.lane=-1;render()}
});
document.addEventListener('input',e=>{
 const t=e.target;
 if(t.id==='q'){S.q=t.value.toLowerCase();$('#fleet-list').innerHTML=TR.roles.fleet.list(S)}
 else if(t.id==='tq'){S.tq=t.value.toLowerCase();S.bin=-1;timelineParts()}
 else if(t.id==='note')$('#cnt').textContent=`${t.value.length} / ${C.NOTE_MAX}`;
});
document.addEventListener('keydown',e=>{
 if(e.target.matches('input,textarea')){if(e.key==='Escape')e.target.blur();return}
 if(e.metaKey||e.ctrlKey||e.altKey)return;
 if((e.key==='Enter'||e.key===' ')&&e.target.matches('.lane[data-act]')){e.preventDefault();e.target.click();return}
 const k=e.key;
 if(k==='j')move(1);else if(k==='k')move(-1);
 else if(k==='/'){e.preventDefault();const q=$('#q')||$('#tq');q&&q.focus()}
 else if(k>='1'&&k<='4'){const v=C.VIEWS[+k-1][0];if(S.scene==='fleet')S.scene='brief';S.view=v;S.lane=-1;render()}
 else if(k==='c'&&S.scene!=='fleet'){S.view='brief';const l=tab().lanes;const i=l.findIndex(x=>x.ctx>=C.HINT);S.lane=i<0?0:i;S.run=-1;render()}
 else if(k==='r')refresh();
 else if(k==='Enter'&&S.scene==='fleet'){S.scene='brief';render()}
 else if(k==='Escape'){if(S.lane>=0){S.lane=-1;stop();S.run=-1}else S.scene='fleet';render()}
});
addEventListener('resize',()=>{const p=$('#pop');p&&TR.roles.popover.place(p,document.querySelectorAll('.lane')[S.lane])});
$('#theme').onclick=()=>{S.theme=S.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=S.theme};
TR.hover.init();
const q=new URLSearchParams(location.search);
if(q.get('theme')==='light'){S.theme='light';document.documentElement.dataset.theme='light'}
if(q.get('sel'))S.sel=q.get('sel');
if(q.get('scene'))go(q.get('scene'));else render();
if(q.get('view')){S.view=q.get('view');S.scene='brief'}
if(q.get('lane')){S.lane=+q.get('lane');S.scene='brief';S.view='brief'}
if(q.get('run')){S.run=+q.get('run');S.view='brief';S.scene='brief';if(S.lane<0)S.lane=0}
if(q.get('bin')){S.bin=+q.get('bin')}
if(q.get('toast'))toast(TR.fixtures.tabs[2].lanes[0]);
if(q.get('solo'))document.body.classList.add('solo');
render();
})();
