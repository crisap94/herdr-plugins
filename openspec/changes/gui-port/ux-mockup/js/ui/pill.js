TR.pill=(st,label)=>`<span class="pill p-${st}">${TR.status(st,12)}${label||TR.C.STATUS_PILL[st]}</span>`;
TR.pillCompacting=()=>`<span class="pill p-working">${TR.status('working',12)}Compacting</span>`;
