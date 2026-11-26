import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { AutocompactSweep, brand, countOf, gateName, instant, must, parseCount, parseUsd, sourcePathOf, textOf, usdOf } from '@stateforge-labs/session-ledger';
import type { BriefRetention, ContextUse, Considers, Count, Directory, GateStats, LegacySessionReader as SessionReader } from '@stateforge-labs/session-ledger';
import { SWEEP_EVERY } from '@stateforge-labs/session-ledger/compaction-timing';
import type { Candidate } from '@stateforge-labs/session-ledger/compaction-timing';
import { databaseFile, openStoreAt, type Store } from '#src/adapters/db/database.ts';
import { decode } from '#src/adapters/db/checked-fact-codec.ts';
import { CatalogueWindows } from '#src/adapters/capability/catalogue.ts';
import { agentWindows } from '#src/adapters/capability/context-window.ts';
import { candidatesOf } from '#src/daemon/autocompact.ts';
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';
import type { CompactLimits } from '#src/ports/compact-limits.ts';
import type { ModelWindows } from '#src/ports/model-catalogue.ts';
import type { PairRecord } from '#src/ports/verdicts.ts';
import { InputRetention } from '#src/recap/application/input-retention.ts';
import { LaneContexts } from '#src/recap/application/lane-contexts.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { parseFactIndex } from '#src/recap/domain/fact-index.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { FollowedSession } from '#src/recap/domain/lane.ts';
import { uncheckedTypeId } from '#src/recap/domain/type-id.ts';
import { idOf } from '#src/adapters/db/typeid.ts';
import { present } from '#src/view-model/present.ts';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import { pathOrNull } from '#test/fakes/agent-kind.ts';
import { cursor, memoryStore, recordOps, runIdOf, runsOf, verdictOf, type RunInput } from '#test/db/support.ts';
import { scratch } from '#test/fixtures/git-repo.ts';
import { agentKind, paneId, tabId } from '#test/support/ids.ts';
import { seenLane } from '#test/support/seen.ts';
import { viewRecord } from '#test/support/tab-view-records.ts';
import { oneTask, withFacts } from '#test/support.ts';
import { SAFE, rows, world, type World } from '#test/autocompact-world.ts';
import { claudeObserved, codexObserved } from '#test/fakes/transcript-lines.ts';
import { evalWorld, type EvalWorld } from '../support/eval-world.ts';

const DAY = 86_400_000;
const STAMP = String.raw`\d\d-\d\d \d\d:\d\d`;

const laneAt = (pane: string, status: string): FollowedSession => laneFrom(seenLane({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status }));
const boardOf = (lanes: readonly FollowedSession[]): Board => ({ ...emptyBoard(), lanes: new Map(lanes.map((found) => [found.pane, found])) });
const settle = (): Promise<void> => new Promise<void>((resolve) => { setImmediate(resolve); });
const quiet = (): void => undefined;

let ew: EvalWorld;
let store: Store;
let w: World;
const lanes = [laneAt('w1:p1', 'idle'), laneAt('w1:p2', 'working'), laneAt('w1:p3', 'done')];

before(() => {
    ew = evalWorld({ judge: 'none' });
    const opened = openStoreAt(databaseFile(ew.state as Directory));
    if (opened.kind !== 'ready') throw new Error('the world store did not open');
    store = opened;
    w = world({}, true, 0, {}, store);
    w.clock.at = Date.now();
});

after(() => {
    store.close();
    ew.close();
});

const consideringWorld = (found: readonly FollowedSession[]): Considers => ({
    prune: (seen: readonly Candidate[]): void => { w.service.prune(seen.map((each) => found.find((lane) => lane.pane === each.key) as FollowedSession)); },
    consider: (candidate: Candidate): Promise<void> => w.service.consider(found.find((lane) => lane.pane === candidate.key) as FollowedSession),
});

test('a sweep over the board compacts the idle lane past the threshold and leaves the working lane alone; the done lane waits, as one automatic compaction holds the others', { timeout: 30_000 }, async () => {
    const sweep = new AutocompactSweep({ candidates: (): readonly Candidate[] => candidatesOf(boardOf(lanes), quiet), autocompact: (): Considers => consideringWorld(lanes), log: quiet });
    await sweep.sweep();
    assert.deepEqual(w.requests, [{ tab: 'w1:t1', pane: 'w1:p1', note: null, origin: 'auto' }]);
    assert.deepEqual(store.decisions.skips().map((skip) => [skip.key, skip.gate, skip.share]), [['w1:p3', 'busy', 62]]);
});

test('the compacted lane has a decision row: the verdict, the answers, the decider, what it cost and the status the lane had', () => {
    const found = rows(w).map((row) => [row.key, row.verdict, row.askedVerdict, row.gate, row.mode, row.share, row.decider, row.tookMs, row.costUsd, row.laneStatus, Object.fromEntries(row.answers)]);
    assert.deepEqual(found, [['w1:p1', 'compact', 'compact', 'ask', 'on', 62, 'fake · m', 550, 0.00003, 'idle', SAFE]]);
});

test('the daemon log gives the figures behind the decision and the skip', () => {
    assert.equal(w.logs[0], 'autocompact w1:p1: 62 % · closes 0.95 · continues 0.05 · choice 0.02 · verbatim 0.10 · subject 0.03 · stuck 0.01 → compact (on)');
    assert.match(w.logs[1] ?? '', /^autocompact w1:p3: 62 % → skip busy \(another lane/);
});

test('a done lane is compacted too, and its decision stores the status done', { timeout: 30_000 }, async () => {
    const other = world();
    await other.service.consider(lanes[2] as FollowedSession);
    assert.deepEqual(other.requests, [{ tab: 'w1:t1', pane: 'w1:p3', note: null, origin: 'auto' }]);
    assert.deepEqual(rows(other).map((row) => [row.key, row.verdict, row.laneStatus]), [['w1:p3', 'compact', 'done']]);
});

test('a second idle lane is held back while the first compaction runs: no request and no decision, a busy skip', { timeout: 30_000 }, async () => {
    w.byPane = { 'w1:p9': 40 };
    await w.service.consider(laneAt('w1:p9', 'idle'));
    assert.equal(w.requests.length, 1);
    assert.equal(rows(w).length, 1);
    assert.deepEqual(store.decisions.skips().filter((skip) => skip.key === 'w1:p9').map((skip) => [skip.gate, skip.share, skip.detail]), [['busy', 40, 'another lane']]);
});

test('the autocompact command lists the decision with its status, share, verdict, gate, decider and cost, the last day\'s total, and the lanes not decided now', { timeout: 30_000 }, async () => {
    const ran = await ew.run(['autocompact']);
    assert.equal(ran.code, 0, ran.stderr);
    const lines = ran.stdout.split('\n');
    assert.match(lines[0] ?? '', /^style balanced · /);
    assert.match(lines[2] ?? '', /^time\s+tab\s+pane\s+status\s+share\s+verdict\s+gate\s+decider\s+cost$/);
    assert.match(lines[3] ?? '', new RegExp(`^${STAMP}  w1:t1  w1:p1  idle    62 %   compact  ask   fake · m  \\$0\\.00003$`));
    assert.deepEqual(lines.slice(4, 6), ['', 'last 24 h: 1 decision, $0.00003']);
    const from = lines.indexOf('not decided now');
    assert.ok(from > 0);
    const skipped = lines.slice(from + 2).filter((line) => line !== '');
    assert.equal(skipped.length, 2);
    assert.ok(skipped.some((line) => new RegExp(`^${STAMP}  w1:t1  w1:p3  62 %\\s+busy\\s+another lane`).test(line)));
    assert.ok(skipped.some((line) => new RegExp(`^${STAMP}  w1:t1  w1:p9  40 %\\s+busy\\s+another lane$`).test(line)));
});

test('a checked fact with a written reason reads back with its section, its exact text and its reason', () => {
    const [decision] = rows(w);
    assert.ok(decision !== undefined);
    const checked = [{ section: 'needs' as const, text: brand<string, 'Text'>('keep the title'), why: brand<string, 'Text'>('the operator asked for it by name') }, { section: 'goal' as const, text: brand<string, 'Text'>('ship retries'), why: null }];
    store.autocompactBriefs.put(decision.id, textOf('brief body'), [must(parseFactIndex(0))], checked, instant(Date.now()));
    const row = ew.sql('SELECT decision_id, body FROM autocompact_brief')[0];
    assert.ok(row !== undefined);
    assert.deepEqual(row['decision_id'], idOf('decision', uncheckedTypeId(decision.id)));
    assert.deepEqual(decode(row['body'] as Uint8Array), { brief: 'brief body', appended: [0], checked });
});

test('the first tick sweeps every idle and done lane of the board, in order, and the next four ticks do nothing; the sixth sweeps again', { timeout: 30_000 }, async () => {
    const considered: string[] = [];
    const board = boardOf([laneAt('w1:p1', 'idle'), laneAt('w1:p2', 'working'), laneAt('w1:p3', 'done'), laneAt('w1:p4', 'idle')]);
    const sweep = new AutocompactSweep({ candidates: (): readonly Candidate[] => candidatesOf(board, quiet), autocompact: (): Considers => ({ prune: quiet, consider: async (found: Candidate): Promise<void> => { considered.push(found.key); } }), log: quiet });
    sweep.tick();
    await settle();
    assert.deepEqual(considered, ['w1:p1', 'w1:p3', 'w1:p4']);
    for (let tick = 1; tick < SWEEP_EVERY; tick += 1) sweep.tick();
    await settle();
    assert.equal(considered.length, 3);
    sweep.tick();
    await settle();
    assert.equal(considered.length, 6);
});

test('a sweep still running when the next is due is skipped, not stacked', { timeout: 30_000 }, async () => {
    let calls = 0;
    const held: { release: () => void } = { release: quiet };
    const board = boardOf([laneAt('w1:p1', 'idle')]);
    const sweep = new AutocompactSweep({ candidates: (): readonly Candidate[] => candidatesOf(board, quiet), autocompact: (): Considers => ({ prune: quiet, consider: (): Promise<void> => { calls += 1; return new Promise<void>((resolve) => { held.release = resolve; }); } }), log: quiet });
    sweep.tick();
    await settle();
    for (let tick = 1; tick <= SWEEP_EVERY; tick += 1) sweep.tick();
    await settle();
    assert.equal(calls, 1);
    held.release();
    await settle();
    for (let tick = 1; tick < SWEEP_EVERY; tick += 1) sweep.tick();
    sweep.tick();
    await settle();
    assert.equal(calls, 2);
});

test('with no autocompact a tick does nothing; a failing board is logged and the sweep runs again later', { timeout: 30_000 }, async () => {
    const logs: string[] = [];
    const board = boardOf([laneAt('w1:p1', 'idle')]);
    const none = new AutocompactSweep({ candidates: (): readonly Candidate[] => candidatesOf(board, quiet), autocompact: (): null => null, log: (line: string): void => { logs.push(line); } });
    none.tick();
    await settle();
    assert.equal(logs.length, 0);
    let broken = true;
    const considered: string[] = [];
    const failing = new AutocompactSweep({ candidates: (): readonly Candidate[] => { if (broken) throw new Error('no board yet'); return candidatesOf(board, quiet); }, autocompact: (): Considers => ({ prune: quiet, consider: async (found: Candidate): Promise<void> => { considered.push(found.key); } }), log: (line: string): void => { logs.push(line); } });
    failing.tick();
    await settle();
    broken = false;
    for (let tick = 1; tick < SWEEP_EVERY; tick += 1) failing.tick();
    failing.tick();
    await settle();
    assert.deepEqual(logs, ['autocompact sweep: no board yet']);
    assert.deepEqual(considered, ['w1:p1']);
});

test('when the board changes between two lanes the next is read again: a lane that went working or is gone is not considered', { timeout: 30_000 }, async () => {
    const considered: string[] = [];
    let current = boardOf([laneAt('w1:p1', 'idle'), laneAt('w1:p2', 'idle'), laneAt('w1:p3', 'idle')]);
    const sweep = new AutocompactSweep({
        candidates: (): readonly Candidate[] => candidatesOf(current, quiet),
        autocompact: (): Considers => ({ prune: quiet, consider: async (found: Candidate): Promise<void> => { considered.push(found.key); if (found.key === 'w1:p1') current = boardOf([laneAt('w1:p1', 'idle'), laneAt('w1:p2', 'working')]); } }),
        log: quiet,
    });
    await sweep.sweep();
    assert.deepEqual(considered, ['w1:p1']);
});

test('a sweep forgets the skips of the lanes that are not idle or done before it considers anything', { timeout: 30_000 }, async () => {
    const order: string[] = [];
    const board = boardOf([laneAt('w1:p1', 'idle'), laneAt('w1:p2', 'working')]);
    const sweep = new AutocompactSweep({
        candidates: (): readonly Candidate[] => candidatesOf(board, quiet),
        autocompact: (): Considers => ({ prune: (seen: readonly Candidate[]): void => { order.push(`prune ${seen.map((found) => found.key).join(',')}`); }, consider: async (found: Candidate): Promise<void> => { order.push(`consider ${found.key}`); } }),
        log: quiet,
    });
    await sweep.sweep();
    assert.deepEqual(order, ['prune w1:p1,w1:p2', 'consider w1:p1']);
});

test('the sweep of the real service forgets the skip of a lane that left: the listing stops showing it', { timeout: 30_000 }, async () => {
    const sweep = new AutocompactSweep({ candidates: (): readonly Candidate[] => candidatesOf(boardOf([laneAt('w1:p1', 'working')]), quiet), autocompact: (): Considers => consideringWorld([laneAt('w1:p1', 'working')]), log: quiet });
    await sweep.sweep();
    assert.deepEqual(store.decisions.skips(), []);
    const ran = await ew.run(['autocompact']);
    assert.ok(!ran.stdout.includes('not decided now'));
});

test('each listed lane is one candidate, ready exactly for the ready statuses, with its pane and tab kept; a pane that is no session key is skipped and logged', () => {
    const board = boardOf([laneAt('w1:p1', 'idle'), laneAt('w1:p2', 'working'), laneAt('w1:p3', 'done'), laneAt('w1:p4', 'blocked'), laneAt('w1:p5', 'unknown')]);
    assert.deepEqual(candidatesOf(board, quiet).map((candidate) => [candidate.scope, candidate.key, candidate.harness, candidate.ready]), [
        ['w1:t1', 'w1:p1', 'claude', true], ['w1:t1', 'w1:p2', 'claude', false], ['w1:t1', 'w1:p3', 'claude', true], ['w1:t1', 'w1:p4', 'claude', false], ['w1:t1', 'w1:p5', 'claude', false],
    ]);
    const logs: string[] = [];
    const odd = { ...laneAt('w1:p1', 'idle'), pane: ' ' as FollowedSession['pane'] };
    const second = laneAt('w1:p2', 'idle');
    const found = candidatesOf({ ...emptyBoard(), lanes: new Map([[odd.pane, odd], [second.pane, second]]) }, (line: string): void => { logs.push(line); });
    assert.deepEqual(found.map((candidate) => candidate.key), ['w1:p2']);
    assert.equal(logs.length, 1);
});

const noLimits: CompactLimits = { limitOf: () => ({ window: null, percent: null }) };
const catalogueOf = (windows: Record<string, number>): ModelWindows => ({ windowOf: (model) => { const window = windows[model]; return window === undefined ? null : countOf(window); } });
const readerOf = (agent: string, model: string | null, tokens: number, window: number | null): SessionReader => ({
    agent: agentKind(agent),
    inFlight: { kind: 'unsupported', why: 'unregistered-reader' },
    locate: () => Promise.resolve({ kind: 'located', source: sourcePathOf('s') }),
    read: () => Promise.reject(new Error('not used')),
    latestPrompt: () => Promise.reject(new Error('not used')),
    observed: () => Promise.resolve({ kind: 'observed', observed: { tokens: countOf(tokens), peak: countOf(tokens), window: window === null ? null : countOf(window), model: model === null ? null : textOf(model) } }),
});

test('a lane\'s context window is the runtime one first, then the catalogue, and the setting overrides both; the same answer is no change; a model nothing knows has no hint', { timeout: 30_000 }, async () => {
    const claude = new LaneContexts(registryWith({ claude: readerOf('claude', 'claude-opus-5-5', 450_000, null) }), agentWindows(catalogueOf({ 'claude-opus-5-5': 1_000_000 })), noLimits, () => null);
    assert.equal(await claude.refresh(laneAt('w1:p1', 'idle')), 'present');
    assert.deepEqual(claude.of(paneId('w1:p1')), { tokens: 450_000, window: 1_000_000, source: 'catalogue' });
    assert.equal(await claude.refresh(laneAt('w1:p1', 'idle')), 'absent');
    const codexLane = laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'codex', cwd: '/w' }));
    const codex = new LaneContexts(registryWith({ codex: readerOf('codex', 'gpt-6-luna', 116_000, 258_400) }), agentWindows(catalogueOf({})), noLimits, () => null);
    await codex.refresh(codexLane);
    assert.equal(codex.of(paneId('w1:p1'))?.source, 'agent');
    const set = new LaneContexts(registryWith({ claude: readerOf('claude', 'claude-opus-5-5', 450_000, null) }), agentWindows(catalogueOf({})), noLimits, () => countOf(500_000));
    await set.refresh(laneAt('w1:p1', 'idle'));
    assert.deepEqual(set.of(paneId('w1:p1')), { tokens: 450_000, window: 500_000, source: 'setting' });
    const unknownLane = laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'opencode', cwd: '/w' }));
    const unknown = new LaneContexts(registryWith({ opencode: readerOf('opencode', 'acme/new', 1000, null) }), agentWindows(catalogueOf({})), noLimits, () => null);
    assert.equal(await unknown.refresh(unknownLane), 'absent');
    assert.equal(unknown.of(paneId('w1:p1')), null);
});

test('the local catalogue knows provider/model, a bare id with anthropic first, strips [1m], and answers nothing for an unknown model or a missing file', { timeout: 30_000 }, () => {
    const fixture = scratch('recap-catalogue-');
    try {
        const file = join(fixture.root, 'models.json');
        writeFileSync(file, JSON.stringify({
            anthropic: { id: 'anthropic', models: { 'claude-opus-5-5': { limit: { context: 1_000_000, output: 64_000 } }, 'claude-haiku-4-5': { limit: { context: 200_000 } } } },
            acme: { id: 'acme', models: { 'big-1': { limit: { context: 128_000 } }, 'claude-haiku-4-5': { limit: { context: 99 } }, empty: {} } },
        }));
        const catalogue = new CatalogueWindows(pathOrNull(file));
        assert.equal(catalogue.windowOf(textOf('acme/big-1')), 128_000);
        assert.equal(catalogue.windowOf(textOf('claude-opus-5-5')), 1_000_000);
        assert.equal(catalogue.windowOf(textOf('claude-opus-5-5[1m]')), 1_000_000);
        assert.equal(catalogue.windowOf(textOf('claude-haiku-4-5')), 200_000);
        assert.equal(catalogue.windowOf(textOf('big-1')), 128_000);
        assert.equal(catalogue.windowOf(textOf('acme/empty')), null);
        assert.equal(catalogue.windowOf(textOf('nobody/nothing')), null);
        assert.equal(new CatalogueWindows(pathOrNull(join(fixture.root, 'missing.json'))).windowOf(textOf('acme/big-1')), null);
    } finally {
        fixture.clean();
    }
});

const rowText = (row: object): string => JSON.stringify(row);

test('a transcript with no usage gives no context: lines that are not json, a user turn only, a codex turn with no token count or an empty one; a codex turn names its model', { timeout: 30_000 }, () => {
    assert.equal(claudeObserved(['not json at all', rowText({ type: 'user', message: { content: 'hi' } })]), null);
    assert.equal(codexObserved([rowText({ type: 'event_msg', payload: { type: 'task_started' } })]), null);
    assert.equal(codexObserved([rowText({ type: 'event_msg', payload: { type: 'token_count', info: null } })]), null);
    const count = (total: number): string => rowText({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: total * 3 }, last_token_usage: { total_tokens: total }, model_context_window: 258_400 }, rate_limits: {} } });
    assert.deepEqual(codexObserved([rowText({ type: 'turn_context', payload: { model: 'gpt-6-luna' } }), count(13_932), count(116_000)]), { tokens: 116_000, peak: 116_000, window: 258_400, model: 'gpt-6-luna' });
});

const noGlow = (): null => null;
const headerOf = (context: ContextUse | null, compactHint: number | null, messages: typeof en = en): string => present({
    tab: viewRecord({ tab: 'w1:t1', column: null, at: 0, lanes: [{ pane: 'w1:p1', agent: 'codex', status: 'idle', title: 'Fix it', cwd: null, context }] }),
    recap: null, notes: new Map(), warnings: [], now: 0, messages, compactHint,
}, 60, noGlow).join('\n');

test('a lane header shows the compact hint with the percentage and the window once the threshold is reached, in both languages, and nothing below it, with the hint off or with an unknown use', { timeout: 30_000 }, () => {
    const use: ContextUse = { tokens: countOf(116_280), window: countOf(258_400), source: 'agent' };
    assert.match(headerOf(use, 40), /compact\? 45% of 258k/);
    assert.match(headerOf({ tokens: countOf(450_000), window: countOf(1_000_000), source: 'table' }, 40), /compact\? 45% of 1M/);
    assert.match(headerOf(use, 40, es), /¿compactar\? 45% de 258k/);
    assert.ok(!headerOf({ ...use, tokens: countOf(100_000) }, 40).includes('compact?'));
    assert.ok(!headerOf(use, null).includes('compact?'));
    assert.ok(!headerOf(null, 40).includes('compact?'));
    assert.ok(!headerOf(use, 50).includes('compact?'));
});

const STATS: GateStats = { refused: { [gateName('G1')]: brand<number, 'Count'>(2) }, flagged: { [gateName('G8')]: brand<number, 'Count'>(1) }, dropped: brand<number, 'Count'>(1) };
const SECTIONS = { goal: textOf('Ship retries'), now: [textOf('Review !256.')], needs: [], done: [textOf('Merged !250.'), textOf('Tagged 1.9.0.')], decisions: [], next: [], links: [textOf('!256')], rules: [] };
const runInput = (at: number, extra: Partial<RunInput> = {}): RunInput => ({
    scope: tabId('w1:t1'), at: instant(at), cause: 'requested', backend: textOf('fake'), language: textOf('en'), costUsd: usdOf(0), error: null, sessions: [cursor('w1:p1')], ...withFacts(oneTask('', SECTIONS)), ...extra,
});
const QUERY = { tab: null, since: null, limit: 20, withInput: false } as const;

test('a run keeps its input document gzipped, with its length and its gate counts', { timeout: 30_000 }, () => {
    const kept = memoryStore();
    const document = '<recap_input version="1">é — ✓ </recap_input>'.repeat(40);
    recordOps(kept, runInput(1000, { input: textOf(document), gateStats: STATS }));
    const [stored] = runsOf(kept.inputs, QUERY);
    assert.ok(stored !== undefined);
    assert.deepEqual([stored.tab, stored.at, stored.input, stored.gateStats], ['w1:t1', 1000, 'present', STATS]);
    assert.equal(kept.inputs.document(stored.id), document);
    const row = kept.db.prepare('SELECT document, bytes FROM run_input').get() as { document: Uint8Array; bytes: number };
    assert.equal(row.bytes, Buffer.byteLength(document));
    assert.ok(row.document.length < row.bytes);
    assert.deepEqual(Buffer.from(row.document).subarray(0, 2), gzipSync('x').subarray(0, 2));
});

test('a run without an input or counts is listed as not judgeable, and a failed run is not listed at all', { timeout: 30_000 }, () => {
    const kept = memoryStore();
    recordOps(kept, runInput(1000));
    kept.records.failRun({ scope: tabId('w1:t1'), at: instant(2000), cause: 'requested', backend: textOf('fake'), language: textOf('en'), costUsd: usdOf(0), error: textOf('boom'), sessions: [cursor('w1:p1')] });
    assert.deepEqual(runsOf(kept.inputs, QUERY).map((r) => [r.at, r.input, r.gateStats]), [[1000, 'absent', null]]);
    assert.deepEqual(runsOf(kept.inputs, { ...QUERY, withInput: true }), []);
});

test('runs come newest first, by tab and by time, with a limit; the items carry their keys in the recap\'s order', { timeout: 30_000 }, () => {
    const kept = memoryStore();
    recordOps(kept, runInput(1000, { input: textOf('<a/>') }));
    recordOps(kept, runInput(2000, { input: textOf('<b/>') }));
    recordOps(kept, runInput(3000, { scope: tabId('w1:t2'), input: textOf('<c/>'), sessions: [cursor('w1:p2')] }));
    assert.deepEqual(runsOf(kept.inputs, QUERY).map((r) => r.at), [3000, 2000, 1000]);
    assert.deepEqual(runsOf(kept.inputs, { ...QUERY, tab: 'w1:t1' }).map((r) => r.at), [2000, 1000]);
    assert.deepEqual(runsOf(kept.inputs, { ...QUERY, since: 2000 }).map((r) => r.at), [3000, 2000]);
    assert.deepEqual(runsOf(kept.inputs, { ...QUERY, limit: 1 }).map((r) => r.at), [3000]);
    const [newest] = runsOf(kept.inputs, { ...QUERY, tab: 'w1:t1' });
    assert.ok(newest !== undefined);
    assert.deepEqual(kept.inputs.itemsOf(newest.id, 'added').map((item) => [item.key, item.text]), [
        ['t1/goal/0', 'Ship retries'], ['t1/now/0', 'Review !256.'], ['t1/done/0', 'Merged !250.'], ['t1/done/1', 'Tagged 1.9.0.'], ['t1/links/0', '!256'],
    ]);
    assert.deepEqual(kept.inputs.itemsOf(runIdOf('run_nonsense'), 'added'), []);
    assert.equal(kept.inputs.document(runIdOf('run_nonsense')), null);
});

test('gate counts since a time come newest first, only for runs that have them', { timeout: 30_000 }, () => {
    const kept = memoryStore();
    recordOps(kept, runInput(1000));
    recordOps(kept, runInput(2000, { gateStats: STATS }));
    recordOps(kept, runInput(3000, { gateStats: { refused: {}, flagged: {}, dropped: brand<number, 'Count'>(0) } }));
    assert.deepEqual(kept.inputs.gateCounts(null).map((entry) => entry.at), [3000, 2000]);
    assert.deepEqual(kept.inputs.gateCounts(instant(2500)).map((entry) => entry.at), [3000]);
});

const retentionOver = (kept: Store, clock: { value: number }, days: { value: number }, briefs: BriefRetention, lines: string[]): InputRetention => new InputRetention({
    inputs: kept.inputs, briefs: kept.autocompactBriefs, clock: { now: (): ReturnType<typeof instant> => instant(clock.value) }, days: (): Count => countOf(days.value), briefRetention: (): BriefRetention => briefs, log: (line: string): void => { lines.push(line); },
});

const briefedDecision = (kept: Store, at: number): ReturnType<Store['decisions']['record']> => kept.decisions.record({
    scope: tabId('w1:t1'), key: paneId('w1:p1'), agent: agentKind('claude'), at: instant(at), mode: 'shadow', share: countOf(50), tokens: must(parseCount(5)), window: must(parseCount(10)), gate: 'ask', verdict: 'compact', askedVerdict: 'compact', answers: new Map(), coverage: null,
    coverageOutcome: null, coverageMs: null, coverageCostUsd: null, laneStatus: null, decider: null, costUsd: must(parseUsd(0)), tookMs: null, why: null,
});

test('the daily upkeep deletes a 15-day-old input and keeps the run, keeps a 13-day-old one, drops the brief past its retention, runs once a day, and keeps none at 0 days', { timeout: 30_000 }, () => {
    const kept = memoryStore();
    const now = 100 * DAY;
    recordOps(kept, runInput(now - 15 * DAY, { input: textOf('<old/>') }));
    recordOps(kept, runInput(now - 13 * DAY, { input: textOf('<recent/>') }));
    kept.autocompactBriefs.put(briefedDecision(kept, now - 15 * DAY), textOf('old brief'), [], [], instant(now - 15 * DAY));
    const clock = { value: now };
    const days = { value: 14 };
    const lines: string[] = [];
    const retention = retentionOver(kept, clock, days, { kind: 'days', value: brand<number, 'RetentionDays'>(14) }, lines);
    assert.equal(retention.tick(), 1);
    assert.deepEqual(runsOf(kept.inputs, QUERY).map((r) => [r.at, r.input === 'present']), [[now - 13 * DAY, true], [now - 15 * DAY, false]]);
    assert.equal(kept.db.prepare('SELECT COUNT(*) AS count FROM autocompact_brief').get()?.['count'], 0);
    assert.match(lines.join(), /deleted 1 stored run input older than 14 days/);
    clock.value += 3_600_000;
    days.value = 0;
    assert.equal(retention.tick(), 0);
    clock.value += DAY;
    assert.equal(retention.tick(), 1);
    assert.deepEqual(runsOf(kept.inputs, { ...QUERY, withInput: true }), []);
});

test('a brief retention of none deletes every checked brief at the daily upkeep, the newest included', { timeout: 30_000 }, () => {
    const kept = memoryStore();
    kept.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
    const now = 100 * DAY;
    kept.autocompactBriefs.put(briefedDecision(kept, now), textOf('fresh brief'), [], [], instant(now));
    retentionOver(kept, { value: now }, { value: 14 }, { kind: 'none' }, []).tick();
    assert.equal(kept.db.prepare('SELECT COUNT(*) AS count FROM autocompact_brief').get()?.['count'], 0);
});

const byCheck = (a: PairRecord, b: PairRecord): number => a.check.localeCompare(b.check);
const verdict = (over: Partial<Parameters<typeof verdictOf>[0]>): ReturnType<typeof verdictOf> => verdictOf({ run: runIdOf('run_x'), item: 't1/done/0', check: 'I3', pass: true, critique: null, judge: 'claude · sonnet · medium', at: 1, source: 'judge', ...over });

test('verdicts round-trip in one transaction, operator labels are found, and pairs join the judge and the operator on the same item and check, newest of each', { timeout: 30_000 }, () => {
    const kept = memoryStore();
    recordOps(kept, runInput(1000, { input: textOf('<a/>') }));
    const [stored] = runsOf(kept.inputs, QUERY);
    assert.ok(stored !== undefined);
    const id = stored.id;
    kept.verdicts.add([
        verdict({ run: id, check: 'I3', pass: true, at: 1 }),
        verdict({ run: id, check: 'I3', pass: false, critique: 'names nothing', at: 2 }),
        verdict({ run: id, check: 'I1', pass: true, at: 2 }),
        verdict({ run: id, item: null, check: 'coverage', pass: true, at: 2 }),
        verdict({ run: id, check: 'I3', pass: false, at: 3, source: 'operator', judge: 'operator' }),
        verdict({ run: id, check: 'I1', pass: true, at: 3, source: 'operator', judge: 'operator' }),
        verdict({ run: id, item: 't1/done/1', check: 'I3', pass: true, at: 3, source: 'operator', judge: 'operator' }),
    ]);
    assert.equal(kept.verdicts.ofRun(id).length, 7);
    assert.deepEqual(kept.verdicts.ofRun(id).find((v) => v.critique !== null), verdict({ run: id, check: 'I3', pass: false, critique: 'names nothing', at: 2 }));
    assert.deepEqual([...kept.verdicts.labelled()].toSorted(), [`${id}|t1/done/0`, `${id}|t1/done/1`]);
    assert.deepEqual(kept.verdicts.pairs().toSorted(byCheck), [{ check: 'I1', judge: 'pass', operator: 'pass' }, { check: 'I3', judge: 'fail', operator: 'fail' }]);
    assert.throws(() => { kept.verdicts.add([verdict({ run: runIdOf('nonsense') })]); }, /not a run id/);
    assert.equal(kept.verdicts.ofRun(id).length, 7);
});
