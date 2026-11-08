TR.chip=(label,icon)=>`<span class="chip">${icon?TR.icon(icon,12):''}${label}</span>`;
TR.laneChip=(lane,i,S)=>{
 const C=TR.C,hint=lane.ctx>=C.HINT,running=S.lane===i&&S.run>=0,open=S.lane===i&&S.run<0;
 const steps=C.STEPS.map((s,k)=>{
  const cls=k<S.run?'ok':k===S.run?'now':'',ic=k<S.run?'done':k===S.run?'working':'idle';
  return `<span class="step ${cls}">${TR.status(ic,12)}${s}${k<=S.run?` ${C.STEP_SECS[k]} s`:''}</span>`}).join('');
 const tail=running?TR.pillCompacting():`<span class="lane-btn">${hint?'compact?':'compact'}${TR.icon('chevron',14)}</span>`;
 return `<div class="lane${hint?' hint':''}${open?' open':''}${running?' run':''}" tabindex="0" role="button" ${running?'':`data-act="compact" data-lane="${i}"`} aria-label="Compact ${lane.name}, context ${lane.ctx}%">
  <div class="lane-top">${TR.status(lane.st,14)}<span class="ag">${lane.agent}</span><b class="grow ellipsis">${lane.name}</b></div>
  <div class="lane-ctx">${TR.meter(lane.ctx)}<span class="pct">${lane.ctx}%</span>${tail}</div>
  ${running?`<div class="steps">${steps}</div>`:''}</div>`;
};
