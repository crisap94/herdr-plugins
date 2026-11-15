import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, appendFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { homedir } from 'node:os';

const [mode, idleSec, soakSec, restart] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4]), process.argv[5] === 'restart'];
const H = homedir();
const tag = process.env.T1_KEEPALIVE ? `${mode}-keepalive` : mode;
const REAL = `${H}/.local/bin/hc`;
const NODE = `${H}/.local/share/mise/installs/node/24.22.0/bin/node`;
const REPO = `${H}/Projects/homelab/herdr-plugins-gui-port/tab-recap`;
const HERE = new URL('.', import.meta.url).pathname;
const STATE = `${H}/.cache/hcs/t1-state/${tag}`;
const OUT = process.env.T1_OUT;
const shimLog = process.env.HC_SHIM_LOG;
const out = [];
const say = (s) => { const l = `${new Date().toISOString()} ${s}`; console.log(l); out.push(l); };
const hc = (...a) => spawnSync(REAL, a, { encoding: 'utf8', env: process.env });
const index = () => { try { return JSON.parse(readFileSync(`${STATE}/gui/index.json`, 'utf8')).tabs; } catch { return []; } };
const rowOf = (tab) => index().find((r) => r.tab === tab);
const rss = (pid) => { try { return Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))[1]); } catch { return -1; } };
const snap = (step) => { try { const rows = index().map(({ at, recapAt, ...r }) => r); writeFileSync(`${OUT}/index.${tag}.${step}.json`, JSON.stringify(rows, null, 1)); } catch {} };
const ctl = (n) => `${STATE}/ctl.${n}`;

async function until(fn, ms) { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return Math.round(performance.now() - t0); await sleep(20); } return null; }

function agent(tab, name, initial) {
  writeFileSync(ctl(name), initial);
  const r = hc('run', '--bg', '--json', '--name', name, '--label', `herdr.tab=${tab}`, '--label', 'herdr.space=ws1', '--no-parent', '--cwd', H, 'bash', `${HERE}agent.sh`, ctl(name));
  say(`start agent ${name} on ${tab}: ${r.stdout.trim().slice(0, 120)} ${r.stderr.trim().slice(0, 120)}`);
}

async function setStatus(tab, name, status) {
  const t0 = performance.now();
  writeFileSync(ctl(name), status);
  const ms = await until(() => rowOf(tab)?.status === status, 5000);
  snap(`${name}-${status}`);
  say(`status ${name}->${status}: index shows it after ${ms === null ? 'TIMEOUT (row=' + JSON.stringify(rowOf(tab)) + ')' : ms + ' ms'}`);
  return ms;
}

function shimCount(since) {
  const lines = existsSync(shimLog) ? readFileSync(shimLog, 'utf8').split('\n').filter(Boolean) : [];
  return lines.filter((l) => Number(l.split(' ')[0]) >= since);
}

rmSync(STATE, { recursive: true, force: true });
mkdirSync(STATE, { recursive: true });
writeFileSync(shimLog, '');
hc('server', 'start');
await sleep(500);
agent('tb1', 'a1', 'idle');
agent('tb2', 'a2', 'idle');
await sleep(800);

const env = { ...process.env, TAB_RECAP_STATE: STATE, TAB_RECAP_FRONTEND: 'gui', TAB_RECAP_HC_TRANSPORT: mode };
const dlog = `${OUT}/daemon-stdout.${tag}.log`;
const fd = (await import('node:fs')).openSync(dlog, 'w');
const pre = process.env.T1_KEEPALIVE ? ['--import', `${HERE}keepalive.mjs`] : [];
const daemon = spawn(NODE, [...pre, `${REPO}/src/daemon/launch-desktop.mjs`], { env, stdio: ['ignore', fd, fd], cwd: REPO });
daemon.on('exit', (c, sg) => say(`DAEMON EXITED code=${c} signal=${sg}`));
const startedAt = Date.now() / 1000;
say(`daemon pid ${daemon.pid} mode=${mode}`);
const ready = await until(() => index().length >= 2, 30000);
say(`index has ${index().length} rows after ${ready} ms: ${JSON.stringify(index().map((r) => [r.tab, r.status]))}`);
const rss0 = rss(daemon.pid);
say(`rss at start ${rss0} kB`);

const idleFrom = Date.now() / 1000;
await sleep(idleSec * 1000);
const idleCalls = shimCount(idleFrom);
say(`idle ${idleSec}s: hc spawns through PATH shim since start of idle = ${idleCalls.length}`);
for (const l of idleCalls.slice(0, 40)) say(`  shim: ${l}`);
const allCalls = shimCount(startedAt);
say(`hc spawns from daemon start to end of idle = ${allCalls.length}`);

const seq = ['working', 'blocked', 'done', 'idle'];
for (const s of seq) await setStatus('tb1', 'a1', s);
const r2 = ['blocked', 'working'];
for (const s of r2) await setStatus('tb2', 'a2', s);
say(`rows now: ${JSON.stringify(index().map((r) => [r.tab, r.status]))}`);
snap('before-kill');
hc('kill', 'a2');
const gone1 = await until(() => !rowOf('tb2') || rowOf('tb2').status !== 'working', 5000);
say(`after kill a2: row=${JSON.stringify(rowOf('tb2'))} (${gone1} ms)`);
hc('rm', 'a2');
const gone = await until(() => !rowOf('tb2'), 3000);
snap('after-rm');
say(`after rm a2: tb2 row ${gone === null ? 'STILL PRESENT ' + JSON.stringify(rowOf('tb2')) : 'gone after ' + gone + ' ms'}; rows ${JSON.stringify(index().map((r) => [r.tab, r.status]))}`);

if (restart) {
  const pubBefore = readFileSync(`${STATE}/gui/index.json`, 'utf8');
  const sockBefore = ss(daemon.pid);
  say(`sockets before restart: ${sockBefore.length}`);
  const t0 = performance.now();
  const r = hc('server', 'restart');
  say(`hc server restart returned after ${Math.round(performance.now() - t0)} ms: ${r.stdout.trim().slice(0, 150)}`);
  agent('tb3', 'a3', 'working');
  const rec = await until(() => rowOf('tb3')?.status === 'working', 60000);
  say(`after restart: new agent tb3 row working after ${rec === null ? 'TIMEOUT' : rec + ' ms from agent start (' + Math.round(performance.now() - t0) + ' ms from restart start)'}`);
  say(`daemon alive: ${daemon.exitCode === null}; sockets now: ${ss(daemon.pid).length}`);
  const t1 = await setStatus('tb3', 'a3', 'blocked');
  say(`rows after restart: ${JSON.stringify(index().map((r) => [r.tab, r.status]))}; tb1 row ${JSON.stringify(rowOf('tb1'))}`);
}

function ss(pid) { const r = spawnSync('ss', ['-xp'], { encoding: 'utf8' }); return r.stdout.split('\n').filter((l) => l.includes(`pid=${pid},`)); }

if (soakSec > 0) {
  const rssStart = rss(daemon.pid);
  say(`soak ${soakSec}s start: rss ${rssStart} kB; sockets ${ss(daemon.pid).length}`);
  const samples = [];
  for (let t = 0; t < soakSec; t += 30) { await sleep(30000); samples.push(rss(daemon.pid)); say(`  t+${t + 30}s rss ${samples.at(-1)} kB`); }
  const rssEnd = rss(daemon.pid);
  say(`soak end: rss ${rssEnd} kB (delta ${rssEnd - rssStart} kB); open sockets of daemon:`);
  for (const l of ss(daemon.pid)) say(`  ss: ${l.replace(/\s+/g, ' ')}`);
  const hcProcs = spawnSync('pgrep', ['-P', String(daemon.pid), '-a'], { encoding: 'utf8' }).stdout.trim();
  say(`daemon children: ${hcProcs || 'none'}`);
}
say(`total shim calls over whole run: ${shimCount(startedAt).length}`);
daemon.kill('SIGTERM');
await sleep(2500);
if (daemon.exitCode === null) { daemon.kill('SIGKILL'); say('daemon needed SIGKILL'); }
for (const n of ['a1', 'a2', 'a3']) hc('kill', n);
hc('server', 'stop');
writeFileSync(`${OUT}/run.${tag}.txt`, out.join('\n') + '\n');
spawnSync('cp', [`${STATE}/daemon.log`, `${OUT}/daemon.${tag}.log`]);
spawnSync('cp', [shimLog, `${OUT}/hc-calls.${tag}.log`]);
