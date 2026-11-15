import net from 'node:net'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const real = path.join(os.homedir(), '.config/herdr-app/herdr-app.sock');
const dir = process.argv[2]; const sock = path.join(dir, 'herdr-app.sock');
try { fs.unlinkSync(sock) } catch {}
net.createServer(c => {
  const u = net.connect(real);
  c.on('data', d => { console.log('C->S', JSON.stringify(d.toString())); u.write(d) });
  u.on('data', d => { console.log('S->C', JSON.stringify(d.toString().slice(0,600)), 'len', d.length); c.write(d) });
  c.on('end', () => u.end()); u.on('end', () => c.end()); u.on('error',()=>c.destroy()); c.on('error',()=>u.destroy());
}).listen(sock);
setTimeout(() => process.exit(0), 8000);
