(function(){
const s=(d,w=1.6)=>`<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
TR.icons={
 blocked:'<circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M8 4.2v4.4" stroke="var(--cut)" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="11.5" r="1.1" fill="var(--cut)"/>',
 done:'<circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6"/>'+s('M5 8.2l2.2 2.2L11 6.2',1.7),
 working:'<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="2"/><path class="arc" d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
 idle:'<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/>',
 unknown:'<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="2.4 2.4"/>',
 chevron:s('M4 6l4 4 4-4',1.8),
 back:s('M10 3L5 8l5 5',1.8),
 refresh:s('M13 8a5 5 0 1 1-1.6-3.7')+s('M13 2.5v3h-3'),
 gear:'<circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/>'+s('M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4'),
 search:'<circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"/>'+s('M10.2 10.2L14 14'),
 clock:'<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/>'+s('M8 4.5V8l2.2 1.4'),
 history:s('M2.5 8a5.5 5.5 0 1 0 1.8-4.1M2.5 2.5v3h3')+s('M8 5v3l2 1.2'),
 jump:s('M3 8h9M8.5 4.5L12 8l-3.5 3.5',1.8),
 send:s('M2 8l12-5-4 11-2.5-4.5z'),
 link:s('M6.5 9.5l3-3M9 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M7 11.5l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1'),
 close:s('M4 4l8 8M12 4l-8 8'),
 bookmark:s('M4.5 2.5h7v11L8 10.5l-3.5 3z'),
 compress:s('M3 4.5h10M5 8h6M7 11.5h2'),
 play:'<path d="M5 3.5l7 4.5-7 4.5z" fill="currentColor"/>',
 bolt:s('M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z')
};
TR.icon=(n,size=14,cls='')=>`<svg class="ic ic-${n} ${cls}" width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true">${TR.icons[n]}</svg>`;
})();
