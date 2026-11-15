import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
const R = process.env.HOME + '/Projects/homelab/herdr-plugins-gui-port/tab-recap/';
const imp = (p) => import(R + p);
const { ExpandedModel } = await imp('src/recap/application/expanded-view.ts');
const { guiTabOf } = await imp('src/recap/application/gui-tab-build.ts');
const { guiIndexRow } = await imp('src/recap/application/gui-index-build.ts');
const { BLANK_READS } = await imp('src/recap/application/gui-tab-reads.ts');
const { must } = await imp('src/protocol/result.ts');
const { encodeGuiTab, guiFileName } = await imp('src/recap/domain/gui-tab.ts');
const { parseText } = await imp('src/recap/domain/text.ts');
const { parseCount } = await imp('src/recap/domain/count.ts');
const { instant } = await imp('src/recap/domain/time.ts');
const { blankRecap } = await imp('src/ports/recap-records.ts');
const { memoryStore, cursor, seed, must: present } = await imp('test/db/support.ts');
const { fact } = await imp('test/fakes/fact-at.ts');
const { MemoryLedger } = await imp('test/fakes/memory-ledger.ts');
const { v2Problems } = await imp('test/gui-schema-support.ts');
const OUT = process.argv[2];
const NOW = Date.now(); const MIN = 60000;
const ids = JSON.parse(process.argv[3]);
const variant = process.argv[4] ?? 'normal';
const win = 200000;
const ctx = (p) => ({ tokens: Math.round(win * p / 100), window: win, source: 'agent' });
const NOWHY = process.env.LONGNEED === 'tight';
const LONG = process.env.LONGNEED === '0' || NOWHY ? 'Ship the rounding fix before the freeze?' : 'Rounding per line matches the server totals the audit found, but the receipt printer sums the rounded lines and then rounds the total again, so two currencies in one cart can disagree by a cent. Which rule is the source of truth for mixed carts, and should the receipt change?';
const specs = [
 { key: 'api', name: 'Cart totals', recapAgo: 3, goal: 'Cart totals match the server within one cent',
  lanes: [['orchestrator', 'blocked', 62, 'claude'], ['docs lane', 'idle', 18, 'claude'], ...(process.env.LANES3 === '1' ? [['review lane', 'working', 41, 'claude']] : [])],
  facts: [['needs', 'Round per line or on the total when two currencies are in one cart?', 14, { why: NOWHY ? null : 'Per line matches the server; on the total matches the receipt.' }], ['needs', LONG, 26, { why: NOWHY ? null : process.env.LONGNEED === '0' ? 'The freeze starts tomorrow.' : 'The printer and the server disagree on mixed currency carts.' }], ['needs', 'Which coupon wins when two apply to the same line?', 9], ['decisions', 'Round at the line level, not the total', 45], ['now', 'Property tests for line rounding are green', 60], ['done', 'Line rounding merged', 170]],
  links: [['MR 42', 'https://git.example/acme/shop/-/merge_requests/42']], extra: [['next','Apply the coupon rule before tax',2]] },
 { key: 'web', name: 'Checkout form', recapAgo: 9, goal: 'Ship the new checkout form',
  lanes: [['form lane', 'blocked', 38, 'claude']],
  facts: [['needs', 'Keep the old form behind a flag for a week?', 12, { why: 'Support asked for a safety net.' }], ['done', 'Merged into main', 30], ['now', 'Review notes are in the MR', 500]], links: [] },
];
let rs = 7; const rnd = () => (rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296;
const subj = ['line rounding', 'coupon rule', 'receipt copy', 'currency table', 'tax step', 'cart schema', 'totals endpoint', 'property tests', 'server mismatch', 'discount stacking'];
const kinds = [['now', 'Working on the '], ['now', 'Reading the code for the '], ['done', 'Finished the '], ['done', 'Merged the '], ['decisions', 'Decided how to handle the '], ['needs', 'Need input on the ']];
const bursts = [[3, 2, 14], [9, 2, 16], [17, 1.5, 12], [22, 2, 20], [28, 3, 14], [33, 1.5, 10], [38, 2, 18], [43, 2, 16], [47.2, .8, 12]];
const bulk = [];
bursts.forEach(([c, w, n]) => { for (let i = 0; i < n; i++) { const k = kinds[Math.floor(rnd() * kinds.length)]; const h = Math.min(46.5, Math.max(0.5, c + (rnd() - .5) * 2 * w)); bulk.push([k[0], k[1] + subj[Math.floor(rnd() * subj.length)], Math.round(h * 60), { state: 'closed', closedWhy: 'done', closedAt: NOW - Math.round(h * 60) * MIN + MIN }]); } });
rmSync(OUT + '/gui', { recursive: true, force: true }); mkdirSync(OUT + '/gui', { recursive: true });
const rows = [];
for (const s of specs) {
  const tab = ids[s.key].tab; const panes = ids[s.key].panes;
  const store = memoryStore();
  const lanes = s.lanes.map(([n, st, p, agent], i) => ({ pane: panes[i], agent, status: st, title: n, cwd: null, context: ctx(p), web: i === 0 ? { base: 'https://git.example/acme/shop', forge: 'gitlab', branch: 'feat/cart' } : null }));
  const view = { tab, column: null, at: NOW, lanes, daemonVersion: variant === 'stale' && s.key === 'api' ? '0.1.0' : '0.9.0' };
  seed(store, { ...blankRecap(tab), at: NOW - s.recapAgo * MIN, lanes: panes.slice(0, lanes.length).map((p) => cursor(p)), tasks: [{ id: 't1', name: '', lanes: panes.slice(0, lanes.length), sections: { goal: s.goal, now: [], needs: [], done: [], decisions: [], next: [], links: [], rules: [] }, markdown: `## Goal\n- ${s.goal}` }] });
  const ledger = new MemoryLedger();
  (s.extra ?? []).forEach((x) => s.facts.push(x));
  (s.links ?? []).forEach((l, i) => s.facts.push(['links', l[0] + ' ' + l[1], 3 + i, { ref: l[0] }]));
  
  s.facts.forEach(([sec, text, ago, more], i) => ledger.seed(fact(`${s.key}${i}`, sec, text, NOW - ago * MIN, { task: { tab, key: 't1' }, ...(more ?? {}) })));
  const deps = { records: store.records, ledger, stories: s.key === 'api' ? { read: () => ({ text: 'The cart team moved totals to line rounding after the server mismatch, then added coupons before tax. Line rounding is merged; the coupon rule is in review and one question about multi-currency rounding is waiting for a decision.', at: NOW - 30 * MIN }), keep: store.stories.keep } : store.stories, session: s.key === 'api' ? { firstSeen: () => NOW - 3 * 24 * 60 * MIN, runsByCause: () => ({ auto: 32, operator: 9 }), compactions: () => [{ tokensBefore: 142000, tokensAfter: 36000, origin: 'auto' }, { tokensBefore: 148000, tokensAfter: 40000, origin: 'operator' }] } : store.session, boundaries: store.boundaries, requests: { requestCurate: () => undefined }, edits: () => [] };
  const expanded = new ExpandedModel(deps).read(tab, view, NOW);
  const recap = present(store.records.readRecap(tab));
  const compactions = [];
  if (s.key === 'api') compactions.push({ id: 'c0', tab, pane: panes[1], agent: 'claude', stage: 'compacted', brief: 'written', writer: 'claude', templateWhy: null, startedAt: NOW - 21 * 60 * MIN, stageAt: NOW - 21 * 60 * MIN + 40000, finishedAt: NOW - 21 * 60 * MIN + 40000, tokensBefore: 142000, tokensAfter: 36000, tookMs: 40000, retried: false, queued: false, why: null, origin: 'auto' });
  if (s.key === 'jobs') compactions.push({ id: 'c1', tab, pane: panes[0], agent: 'claude', stage: variant === 'running' ? 'compacting' : 'compacted', brief: 'written', writer: 'claude', templateWhy: null, startedAt: NOW - 40000, stageAt: NOW - 10000, finishedAt: variant === 'running' ? null : NOW - 10000, tokensBefore: 150000, tokensAfter: 40000, tookMs: 30000, retried: false, queued: false, why: null, origin: 'operator' });
  const doc0 = guiTabOf(recap, view, instant(NOW), { ...BLANK_READS, expanded, compactions, compactHint: must(parseCount(70)), zone: must(parseText('UTC')), plugin: must(parseText('0.9.0')) });
  const doc1 = { ...doc0, name: must(parseText(s.name)) };
  const doc = doc1;
  const json = JSON.parse(JSON.stringify(doc));
  const problems = v2Problems(json);
  if (problems.length) { console.error(s.key, problems); process.exit(1); }
  const enc = encodeGuiTab(doc);
  if (enc.kind === 'err') throw new Error('too big');
  writeFileSync(`${OUT}/gui/${guiFileName(tab)}`, enc.value);
  rows.push(guiIndexRow(doc));
  console.log(s.key, tab, doc.status, 'lanes', doc.lanes.length, 'facts', doc.tasks[0].facts.length);
}
writeFileSync(`${OUT}/gui/index.json`, JSON.stringify({ version: 1, tabs: rows }));
