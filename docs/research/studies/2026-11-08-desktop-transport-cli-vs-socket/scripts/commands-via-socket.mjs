import net from 'node:net'; import os from 'node:os'; import path from 'node:path';
const c=net.connect(path.join(os.homedir(),'.config/herdr-app/herdr-app.sock')); let b='';
c.on('connect',()=>c.write('{"commands":true}\n')); c.on('data',d=>b+=d);
c.on('close',()=>{const j=JSON.parse(b);console.log('socket commands:',(j.commands??j).length)});
