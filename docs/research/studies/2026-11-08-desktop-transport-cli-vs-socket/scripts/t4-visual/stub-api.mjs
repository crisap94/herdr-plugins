import { createServer } from 'node:http';
import { readFileSync, writeFileSync, rmSync, cpSync, chmodSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const [guiDir, pristine, controlFile] = process.argv.slice(2);
const token = randomBytes(32).toString('hex');
const startedAt = Date.now();
let seq = 1;
let waiters = [];
const log = [];

const control = () => {
  try { return JSON.parse(readFileSync(controlFile, 'utf8')); } catch { return {}; }
};
const reset = (name = 'short') => {
  const keep = read('api.json');
  rmSync(guiDir, { recursive: true, force: true });
  mkdirSync(guiDir, { recursive: true });
  cpSync(join(pristine, name, 'gui'), guiDir, { recursive: true });
  if (keep) writeFileSync(join(guiDir, 'api.json'), keep, { mode: 0o600 });
  seq += 1;
  wake();
};
const wake = () => { const w = waiters; waiters = []; w.forEach((f) => f()); };
const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
const later = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (name) => { try { return readFileSync(join(guiDir, name), 'utf8'); } catch { return null; } };

const LONGBODY = 'You are about to be compacted. Keep the goal, the open questions and the decisions already taken. Before you stop, write the state a fresh session needs: what is done, what is in progress, what is blocked and why, and the exact next step. Do not restate the whole history; the recap holds it.';
const guidance = (note) => {
  const lines = [LONGBODY, '', 'Keep:', '- the goal: cart totals match the server within one cent', '- the rounding rule once it is decided', '- the open needs and who they wait on', '', 'Drop:', '- exploration that led nowhere', '- raw tool output'];
  if (note) lines.push('', `Operator note: ${note}`);
  return lines.join('\n');
};

const answer = async (res, tab, id, mode) => {
  if (mode === 'slow') await later(4000);
  if (mode === '404') return send(res, 404, { error: 'unknown-tab' });
  if (mode === '404need') return send(res, 404, { error: 'unknown-need' });
  if (mode === '409') return send(res, 409, { error: 'not-open' });
  if (mode === '409need') return send(res, 409, { error: 'not-a-need' });
  if (mode === '429') return send(res, 429, { error: 'rate-limited' });
  if (mode === '500') return send(res, 500, { error: 'internal' });
  const text = read(`${tab}.json`);
  if (!text) return send(res, 404, { error: 'unknown-tab' });
  const doc = JSON.parse(text);
  const fact = doc.tasks.flatMap((t) => t.facts).find((f) => f.id === id);
  if (!fact) return send(res, 404, { error: 'unknown-need' });
  if (fact.section !== 'needs') return send(res, 409, { error: 'not-a-need' });
  if (fact.state !== 'open') return send(res, 409, { error: 'not-open' });
  fact.state = 'closed'; fact.closedWhy = 'answered'; fact.closedAt = Date.now();
  writeFileSync(join(guiDir, `${tab}.json`), JSON.stringify(doc));
  const index = JSON.parse(read('index.json'));
  const row = index.tabs.find((r) => r.tab === tab);
  if (row) row.needs = Math.max(0, row.needs - 1);
  writeFileSync(join(guiDir, 'index.json'), JSON.stringify(index));
  seq += 1; wake();
  send(res, 200, { answered: true, id });
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  const c = control();
  log.push(`${req.method} ${path}${url.search}`);
  if (path === '/__reset') { reset(url.searchParams.get('name') ?? 'short'); return send(res, 200, { ok: true }); }
  if (path === '/__log') return send(res, 200, log);
  if (path === '/v1/health') return send(res, 200, { ok: true, version: 1, pid: process.pid, startedAt, seq });
  if (req.headers.authorization !== `Bearer ${token}`) return send(res, 401, { error: 'unauthorized' });
  if (path === '/v1/index') return send(res, 200, read('index.json') ?? '{"version":1,"tabs":[]}');
  if (path === '/v1/events') {
    const since = Number(url.searchParams.get('since') ?? 0);
    const wait = Math.min(Number(url.searchParams.get('wait') ?? 25), 25);
    const body = () => ({ seq, epoch: startedAt, reset: false, events: seq > since ? [{ seq, topic: 'index', tab: null, at: Date.now() }, ...(JSON.parse(read('index.json') ?? '{"tabs":[]}').tabs.map((r) => ({ seq, topic: 'tab', tab: r.tab, at: Date.now() })))] : [] });
    if (seq > since) return send(res, 200, body());
    let done = false;
    const finish = () => { if (done) return; done = true; send(res, 200, body()); };
    waiters.push(finish);
    setTimeout(finish, wait * 1000);
    return;
  }
  let m = path.match(/^\/v1\/tabs\/([^/]+)$/u);
  if (m && req.method === 'GET') { const t = read(`${m[1]}.json`); return t ? send(res, 200, t) : send(res, 404, { error: 'unknown-tab' }); }
  m = path.match(/^\/v1\/tabs\/([^/]+)\/(open|refresh)$/u);
  if (m) return send(res, 200, { ok: true });
  m = path.match(/^\/v1\/tabs\/([^/]+)\/needs\/([^/]+)\/answer$/u);
  if (m && req.method === 'POST') return answer(res, m[1], decodeURIComponent(m[2]), c.answer ?? 'success');
  m = path.match(/^\/v1\/tabs\/([^/]+)\/compact-message$/u);
  if (m) {
    const mode = c.compact ?? 'ok';
    if (mode === 'slow') await later(5000);
    if (mode === '404') return send(res, 404, { error: 'unknown-tab' });
    if (mode === '404pane') return send(res, 404, { error: 'unknown-pane' });
    if (mode === '400') return send(res, 400, { error: 'bad-request' });
    if (mode === 'toolong') return send(res, 400, { error: 'note-too-long' });
    if (mode === '500') return send(res, 500, { error: 'internal' });
    const text = guidance(url.searchParams.get('note') ?? '');
    return send(res, 200, { kind: 'guidance', text: mode === 'over' ? `${text}\n\n${'Goal detail line that keeps the message past the limit. '.repeat(60)}` : text, limit: 3000, noteLimit: 280, model: false });
  }
  m = path.match(/^\/v1\/tabs\/([^/]+)\/handoff-message$/u);
  if (m) {
    const mode = c.handoff ?? 'ok';
    if (mode === 'slow') await later(5000);
    if (mode === '404') return send(res, 404, { error: 'unknown-tab' });
    if (mode === '404pane') return send(res, 404, { error: 'unknown-pane' });
    if (mode === '409') return send(res, 409, { error: 'handoff-refused', detail: 'The source lane has no session to read yet, so there is nothing to hand off. Start it and ask again after its first reply.' });
    if (mode === '500') return send(res, 500, { error: 'internal' });
    return send(res, 200, { kind: 'handoff', text: `Handoff from ${url.searchParams.get('from')} to ${url.searchParams.get('to')}\n\nGoal: cart totals match the server within one cent.\nOpen: which rounding rule wins for mixed currency carts.\nNext: apply the coupon rule before tax.` });
  }
  send(res, 404, { error: 'not-found' });
});

reset();
server.listen(0, '127.0.0.1', () => {
  const file = join(guiDir, 'api.json');
  writeFileSync(file, JSON.stringify({ version: 1, port: server.address().port, token, pid: process.pid, startedAt }), { mode: 0o600 });
  chmodSync(file, 0o600);
  console.log('listening', server.address().port, 'pid', process.pid);
});
const stop = () => { rmSync(join(guiDir, 'api.json'), { force: true }); process.exit(0); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
