import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, openSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { homedir } from 'node:os';

const idleSec = Number(process.argv[2] ?? 90);
const soakSec = Number(process.argv[3] ?? 300);
const H = homedir();
const REAL = `${H}/.local/bin/hc`;
const NODE = `${H}/.local/share/mise/installs/node/24.22.0/bin/node`;
const REPO = `${H}/Projects/homelab/herdr-plugins-gui-port/tab-recap`;
const HERE = new URL('.', import.meta.url).pathname;
const STATE = `${H}/.cache/hcs/t1-state2`;
const OUT = process.env.T1_OUT;
const shimLog = process.env.HC_SHIM_LOG;
const out = [];
const say = (s) => { const l = `${new Date().toISOString()} ${s}`; console.log(l); out.push(l); };
const hc = (...a) => spawnSync(REAL, a, { encoding: 'utf8', env: process.env });
const index = () => { try { return JSON.parse(readFileSync(`${STATE}/gui/index.json`, 'utf8')).tabs; } catch { return []; } };
const rowOf = (tab) => index().find((r) => r.tab === tab);
const rss = (pid) => { try { return Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))[1]); } catch { return -1; } };
const ctl = (n) => `${STATE}/ctl.${n}`;
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const corePid = () => { try { return JSON.parse(hc('server', 'status', '--json').stdout).pid; } catch { return null; } };
const ss = (pid) => spawnSync('ss', ['-xp'], { encoding: 'utf8' }).stdout.split('\n').filter((l) => l.includes(`pid=${pid},`));
async function until(fn, ms) { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return Math.round(performance.now() - t0); await sleep(20); } return null; }
const shimCount = (since) => (existsSync(shimLog) ? readFileSync(shimLog, 'utf8').split('\n').filter(Boolean) : []).filter((l) => Number(l.split(' ')[0]) >= since);
const names = [];

function agent(tab, name, initial) {
  writeFileSync(ctl(name), initial);
  names.push(name);
  const r = hc('run', '--bg', '--json', '--name', name, '--label', `herdr.tab=${tab}`, '--label', 'herdr.space=ws1', '--no-parent', '--cwd', H, 'bash', `${HERE}agent.sh`, ctl(name));
  say(`start agent ${name} on ${tab}: ${r.stdout.trim().slice(0, 100)} ${r.stderr.trim().slice(0, 100)}`);
}

rmSync(STATE, { recursive: true, force: true });
mkdirSync(STATE, { recursive: true });
writeFileSync(shimLog, '');
hc('server', 'start');
await sleep(500);
agent('tb1', 'a1', 'working');
await sleep(800);

const env = { ...process.env, TAB_RECAP_STATE: STATE, TAB_RECAP_FRONTEND: 'gui', TAB_RECAP_HC_TRANSPORT: 'socket' };
const dlog = `${OUT}/daemon-stdout.round2.log`;
const fd = openSync(dlog, 'w');
const daemon = spawn(NODE, [`${REPO}/src/daemon/launch-desktop.mjs`], { env, stdio: ['ignore', fd, fd], cwd: REPO });
let exited = null;
daemon.on('exit', (c, sg) => { exited = { c, sg, at: Date.now() }; say(`DAEMON EXITED code=${c} signal=${sg}`); });
const startedAt = Date.now() / 1000;
say(`daemon pid ${daemon.pid} (no keepalive preload) core pid ${corePid()}`);
say(`index ready after ${await until(() => index().length >= 1, 30000)} ms: ${JSON.stringify(index().map((r) => [r.tab, r.status]))}`);
const rss0 = rss(daemon.pid);
say(`rss at start ${rss0} kB`);

const logs = () => [dlog, `${STATE}/daemon.log`].filter(existsSync).map((f) => readFileSync(f, 'utf8')).join('\n');
const bad = () => logs().split('\n').filter((l) => /blind at subscribe|subscription ended/.test(l));

say('--- check 2: add then close an agent terminal');
agent('tb2', 'a2', 'working');
say(`a2 row working after ${await until(() => rowOf('tb2')?.status === 'working', 8000)} ms`);
hc('kill', 'a2');
hc('rm', 'a2');
say(`a2 row gone after ${await until(() => !rowOf('tb2'), 8000)} ms`);
await sleep(1500);
say(`check 2: 'blind at subscribe'/'subscription ended' lines = ${bad().length}`);
for (const l of bad()) say(`  BAD: ${l}`);

say('--- check 3: idle');
const idleFrom = Date.now() / 1000;
await sleep(idleSec * 1000);
const idleCalls = shimCount(idleFrom);
say(`check 3: idle ${idleSec}s hc spawns by daemon = ${idleCalls.length}; since daemon start = ${shimCount(startedAt).length}`);
for (const l of idleCalls.slice(0, 20)) say(`  shim: ${l}`);

say('--- check 1: core restarts');
const results = [];
async function recover(kind, i) {
  const before = corePid();
  const pubMtime = () => { try { return readFileSync(`${STATE}/gui/index.json`, 'utf8'); } catch { return ''; } };
  const t0 = performance.now();
  if (kind === 'restart') {
    const r = hc('server', 'restart');
    say(`[${kind} ${i}] hc server restart returned after ${Math.round(performance.now() - t0)} ms (core ${before} -> ${corePid()}) ${r.stdout.trim().slice(0, 80)}`);
  } else {
    process.kill(before, 'SIGKILL');
    await until(() => !alive(before), 5000);
    say(`[${kind} ${i}] core ${before} killed -9, gone after ${Math.round(performance.now() - t0)} ms`);
    await sleep(700);
    const t1 = performance.now();
    hc('server', 'start');
    say(`[${kind} ${i}] hc server start returned after ${Math.round(performance.now() - t1)} ms (core ${corePid()})`);
  }
  const tUp = performance.now();
  const tab = `tr${kind[0]}${i}`;
  const name = `r${kind[0]}${i}`;
  agent(tab, name, 'working');
  const tAgent = performance.now();
  const ms = await until(() => rowOf(tab)?.status === 'working', 60000);
  const total = ms === null ? null : Math.round(performance.now() - t0);
  const fromUp = ms === null ? null : Math.round(performance.now() - tUp);
  const fromAgent = ms;
  writeFileSync(ctl(name), 'blocked');
  const st = await until(() => rowOf(tab)?.status === 'blocked', 5000);
  say(`[${kind} ${i}] daemon alive=${exited === null}; new agent row working: ${fromAgent === null ? 'TIMEOUT' : fromAgent + ' ms after agent start, ' + fromUp + ' ms after core up, ' + total + ' ms after restart began'}; status change to blocked: ${st} ms; daemon sockets ${ss(daemon.pid).length}`);
  results.push({ kind, i, alive: exited === null, fromAgent, fromUp, total, st });
  await sleep(1500);
}
for (let i = 1; i <= 3; i++) await recover('restart', i);
for (let i = 1; i <= 3; i++) await recover('hardkill', i);
say(`check 2 again after all restarts: bad lines = ${bad().length} (restart-time reconnect lines are expected to be different text)`);
for (const l of bad()) say(`  LOG: ${l}`);

if (soakSec > 0) {
  say('--- check 4: soak');
  const rssStart = rss(daemon.pid);
  say(`soak ${soakSec}s start: rss ${rssStart} kB; sockets ${ss(daemon.pid).length}`);
  const samples = [];
  for (let t = 0; t < soakSec; t += 30) { await sleep(30000); samples.push(rss(daemon.pid)); say(`  t+${t + 30}s rss ${samples.at(-1)} kB`); }
  const rssEnd = rss(daemon.pid);
  say(`soak end: rss ${rssEnd} kB (delta ${rssEnd - rssStart} kB, min ${Math.min(...samples)}, max ${Math.max(...samples)}); rss at daemon start ${rss0} kB`);
  for (const l of ss(daemon.pid)) say(`  ss: ${l.replace(/\s+/g, ' ')}`);
  say(`daemon children: ${spawnSync('pgrep', ['-P', String(daemon.pid), '-a'], { encoding: 'utf8' }).stdout.trim() || 'none'}`);
}
say(`total hc spawns by daemon over whole run: ${shimCount(startedAt).length}`);

say('--- check 5: SIGTERM');
const pid = daemon.pid;
const tt = performance.now();
daemon.kill('SIGTERM');
const gone = await until(() => exited !== null && !alive(pid), 5000);
say(`check 5: exit code=${exited?.c} signal=${exited?.sg}; process gone after ${gone} ms (${Math.round(performance.now() - tt)} ms); leftover sockets of pid: ${ss(pid).length}`);
if (exited === null) { daemon.kill('SIGKILL'); say('daemon needed SIGKILL'); }
for (const n of names) hc('kill', n);
const cp = corePid();
hc('server', 'stop');
say(`core stopped (was ${cp}); alive now: ${cp ? alive(cp) : 'n/a'}`);
writeFileSync(`${OUT}/run.round2.txt`, out.join('\n').replaceAll(H, '~') + '\n');
spawnSync('cp', [`${STATE}/daemon.log`, `${OUT}/daemon.round2.log`]);
spawnSync('cp', [shimLog, `${OUT}/hc-calls.round2.log`]);
writeFileSync(`${OUT}/results.round2.json`, JSON.stringify(results, null, 1));
