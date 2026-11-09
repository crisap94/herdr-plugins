import net from 'node:net'; import os from 'node:os'; import path from 'node:path';
const sock = path.join(os.homedir(), '.config/herdr-app/herdr-app.sock');
function t(label, payload, wait=1500){ return new Promise(res=>{ const c=net.connect(sock); let n=0,b='',closed=false; const t0=Date.now();
 c.on('data',d=>{n+=d.length;b+=d}); c.on('close',()=>{closed=true});
 c.on('connect',()=>c.write(payload));
 setTimeout(()=>{ console.log(label,JSON.stringify(payload),'bytes',n,'closedByServer',closed,'lines',b.split('\n').length-1,'head',JSON.stringify(b.slice(0,120).replaceAll(os.homedir(),'~'))); c.destroy(); res() },wait)})}
await t('single ls','{"ls":true}\n');
await t('two ls one conn','{"ls":true}\n{"status":true}\n');
await t('status+no newline','{"status":true}');
await t('unknown key','{"nonsense":true}\n');
await t('subscribe-ish','{"subscribe":true}\n');
await t('watch-ish','{"watch":true}\n',3000);
