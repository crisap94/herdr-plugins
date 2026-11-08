TR.derive={};
TR.derive.maxCtx=t=>Math.max(...t.lanes.map(l=>l.ctx));
TR.derive.byUrgency=tabs=>{const o=TR.C.STATUS_ORDER;return tabs.slice().sort((a,b)=>o.indexOf(a.st)-o.indexOf(b.st)||b.waitMin-a.waitMin)};
TR.derive.ago=min=>min<1?'just now':min<60?`${Math.round(min)} min ago`:min<1440?`${Math.round(min/60)} h ago`:`${Math.round(min/1440)} d ago`;
TR.derive.span=min=>TR.derive.ago(min);
TR.derive.since=(tab,seen)=>{
 const f=tab.facts.filter(x=>x.ago<seen),n=k=>f.filter(x=>x.kind===k).length;
 return {seen,need:n('need'),dec:n('decision'),comp:n('compaction'),fact:n('fact'),total:f.length};
};
TR.derive.ms=t=>TR.C.START+t*60000;
TR.derive.clock=t=>{const d=new Date(TR.derive.ms(t));return String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')};
TR.derive.day=t=>{const d=new Date(TR.derive.ms(t));return TR.C.MONTHS[d.getUTCMonth()]+' '+d.getUTCDate()};
TR.derive.weekday=t=>TR.C.DAYS[new Date(TR.derive.ms(t)).getUTCDay()];
TR.derive.matches=(e,f)=>(!f.sections.size||f.sections.has(e.sec))&&(!f.q||e.text.toLowerCase().includes(f.q));
TR.derive.bins=(events,count,hours)=>{
 const size=hours*60/count,bins=Array.from({length:count},(_,i)=>({i,t0:i*size,t1:(i+1)*size,events:[],counts:{}}));
 events.forEach(e=>{const b=bins[Math.min(count-1,Math.floor(e.t/size))];b.events.push(e);b.counts[e.sec]=(b.counts[e.sec]||0)+1});
 bins.forEach(b=>{b.n=b.events.length;b.dominant=TR.C.SECTIONS.reduce((m,s)=>(b.counts[s]||0)>(b.counts[m]||0)?s:m,'needs')});
 return bins;
};
TR.derive.feed=(events,breaks,f)=>{
 const list=events.filter(e=>TR.derive.matches(e,f)&&(!f.bin||(e.t>=f.bin.t0&&e.t<f.bin.t1))).map(e=>({type:'event',t:e.t,e}));
 const brk=f.bin||f.q||f.sections.size?[]:breaks.map(b=>({type:'break',t:b.t,b}));
 const rows=list.concat(brk).sort((a,b)=>b.t-a.t),out=[];let day='';
 rows.forEach(r=>{const d=TR.derive.day(r.t);if(d!==day){day=d;out.push({type:'day',label:d+' ('+TR.derive.weekday(r.t)+')'})}out.push(r)});
 return {rows:out,count:list.length};
};
