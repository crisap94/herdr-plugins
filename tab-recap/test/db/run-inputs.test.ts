import { parseUsd, usdOf } from '#src/recap/domain/usd.ts';
import { brand } from '#src/recap/domain/brand.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, countOf, type Count } from '#src/recap/domain/count.ts';
import { agentKind, paneId, tabId } from '#test/support/ids.ts';
import type { BriefRetention } from '#src/recap/domain/autocompact.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { InputRetention } from '#src/recap/application/input-retention.ts';
import { gateName } from '#src/recap/domain/gates/gatekeeper.ts';
import type { GateStats } from '#src/recap/domain/gates/index.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { PairRecord } from '#src/ports/verdicts.ts';
import { cursor, memoryStore, recordOps, runIdOf, runsOf, verdictOf, type RunInput } from './support.ts';
import { oneTask, withFacts } from '#test/support.ts';
import { textOf } from '#src/recap/domain/text.ts';

const DAY = 86_400_000;
const count = brand<number, 'Count'>;
const STATS: GateStats = { refused: { [gateName('G1')]: count(2) }, flagged: { [gateName('G8')]: count(1) }, dropped: count(1) };
const SECTIONS = { goal: textOf('Ship retries'), now: [textOf('Review !256.')], needs: [], done: [textOf('Merged !250.'), textOf('Tagged 1.9.0.')], decisions: [], next: [], links: [textOf('!256')], rules: [] };

const run = (at: number, extra: Partial<RunInput> = {}): RunInput => ({
    scope: tabId('w1:t1'), at: instant(at), cause: 'requested', backend: textOf('fake'), language: textOf('en'), costUsd: usdOf(0), error: null, sessions: [cursor('w1:p1')], ...withFacts(oneTask('', SECTIONS)), ...extra,
});

const QUERY = { tab: null, since: null, limit: 20, withInput: false } as const;

test('a run keeps its input document (inflated equal, bytes = uncompressed length) and its gate counts', () => {
    const store = memoryStore();
    const document = '<recap_input version="1">é — ✓ </recap_input>'.repeat(40);
    recordOps(store, run(1000, { input: textOf(document), gateStats: STATS }));
    const [stored] = runsOf(store.inputs, QUERY);
    assert.ok(stored !== undefined);
    assert.deepEqual([stored.tab, stored.at, stored.input, stored.gateStats], ['w1:t1', 1000, 'present', STATS]);
    assert.equal(store.inputs.document(stored.id), document);
    const row = store.db.prepare('SELECT document, bytes FROM run_input').get() as { document: Uint8Array; bytes: number };
    assert.equal(row.bytes, Buffer.byteLength(document));
    assert.ok(row.document.length < row.bytes, 'compressed');
    assert.deepEqual(Buffer.from(row.document).subarray(0, 2), gzipSync('x').subarray(0, 2), 'gzip');
});

test('a run without an input or counts is listed (not as judgeable) and a failed run is not listed at all', () => {
    const store = memoryStore();
    recordOps(store, run(1000));
    store.records.failRun({ scope: tabId('w1:t1'), at: instant(2000), cause: 'requested', backend: textOf('fake'), language: textOf('en'), costUsd: usdOf(0), error: textOf('boom'), sessions: [cursor('w1:p1')] });
    const listed = runsOf(store.inputs, QUERY);
    assert.deepEqual(listed.map((r) => [r.at, r.input, r.gateStats]), [[1000, 'absent', null]]);
    assert.deepEqual(runsOf(store.inputs, { ...QUERY, withInput: true }), []);
});

test('runs come newest first, by tab and by time, with a limit; the items carry their keys in the recap\'s order', () => {
    const store = memoryStore();
    recordOps(store, run(1000, { input: textOf('<a/>') }));
    recordOps(store, run(2000, { input: textOf('<b/>') }));
    recordOps(store, run(3000, { scope: tabId('w1:t2'), input: textOf('<c/>'), sessions: [cursor('w1:p2')] }));
    assert.deepEqual(runsOf(store.inputs, QUERY).map((r) => r.at), [3000, 2000, 1000]);
    assert.deepEqual(runsOf(store.inputs, { ...QUERY, tab: 'w1:t1' }).map((r) => r.at), [2000, 1000]);
    assert.deepEqual(runsOf(store.inputs, { ...QUERY, since: 2000 }).map((r) => r.at), [3000, 2000]);
    assert.deepEqual(runsOf(store.inputs, { ...QUERY, limit: 1 }).map((r) => r.at), [3000]);
    const [newest] = runsOf(store.inputs, { ...QUERY, tab: 'w1:t1' });
    assert.ok(newest !== undefined);
    assert.deepEqual(store.inputs.itemsOf(newest.id, 'added').map((item) => [item.key, item.text]), [
        ['t1/goal/0', 'Ship retries'], ['t1/now/0', 'Review !256.'], ['t1/done/0', 'Merged !250.'], ['t1/done/1', 'Tagged 1.9.0.'], ['t1/links/0', '!256'],
    ]);
    assert.deepEqual(store.inputs.itemsOf(runIdOf('run_nonsense'), 'added'), []);
    assert.equal(store.inputs.document(runIdOf('run_nonsense')), null);
});

test('gate counts since a time, newest first, only for runs that have them', () => {
    const store = memoryStore();
    recordOps(store, run(1000));
    recordOps(store, run(2000, { gateStats: STATS }));
    recordOps(store, run(3000, { gateStats: { refused: {}, flagged: {}, dropped: count(0) } }));
    assert.deepEqual(store.inputs.gateCounts(null).map((entry) => entry.at), [3000, 2000]);
    assert.deepEqual(store.inputs.gateCounts(instant(2500)).map((entry) => entry.at), [3000]);
});

test('retention: the daily upkeep deletes a 15-day-old input and keeps the run, and keeps a 13-day-old one; it runs once a day; 0 keeps none', () => {
    const store = memoryStore();
    const now = 100 * DAY;
    recordOps(store, run(now - 15 * DAY, { input: textOf('<old/>') }));
    recordOps(store, run(now - 13 * DAY, { input: textOf('<recent/>') }));
    const decision = store.decisions.record({ scope: tabId('w1:t1'), key: paneId('w1:p1'), agent: agentKind('claude'), at: instant(now - 15 * DAY), mode: 'shadow', share: countOf(50), tokens: must(parseCount(5)), window: must(parseCount(10)), gate: 'ask', verdict: 'compact', askedVerdict: 'compact', answers: new Map(), coverage: null, coverageOutcome: null, coverageMs: null, coverageCostUsd: null, laneStatus: null, decider: null, costUsd: must(parseUsd(0)), tookMs: null, why: null });
    store.autocompactBriefs.put(decision, textOf('old brief'), [], [], instant(now - 15 * DAY));
    let clock = now;
    const lines: string[] = [];
    const days = { value: 14 };
    const retention = new InputRetention({ inputs: store.inputs, briefs: store.autocompactBriefs, clock: { now: (): ReturnType<typeof instant> => instant(clock) }, days: (): Count => countOf(days.value), briefRetention: (): BriefRetention => ({ kind: 'days', value: brand<number, 'RetentionDays'>(14) }), log: (line: string): void => { lines.push(line); } });
    assert.equal(retention.tick(), 1);
    assert.deepEqual(runsOf(store.inputs, QUERY).map((r) => [r.at, r.input === 'present']), [[now - 13 * DAY, true], [now - 15 * DAY, false]], 'the run stays, its input is gone');
    assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM autocompact_brief').get()?.['count'], 0, 'the checked brief is past its retention');
    assert.match(lines.join(), /deleted 1 stored run input older than 14 days/);
    clock += 3_600_000;
    days.value = 0;
    assert.equal(retention.tick(), 0, 'once a day');
    clock += DAY;
    assert.equal(retention.tick(), 1, 'zero days keeps none');
    assert.deepEqual(runsOf(store.inputs, { ...QUERY, withInput: true }), []);
});

const byCheck = (a: PairRecord, b: PairRecord): number => a.check.localeCompare(b.check);

const verdict = (over: Partial<Parameters<typeof verdictOf>[0]>): ReturnType<typeof verdictOf> => verdictOf({ run: runIdOf('run_x'), item: 't1/done/0', check: 'I3', pass: true, critique: null, judge: 'claude · sonnet · medium', at: 1, source: 'judge', ...over });

test('verdicts round-trip, one transaction; operator labels are found; pairs join judge and operator on the same item and check, newest of each', () => {
    const store = memoryStore();
    recordOps(store, run(1000, { input: textOf('<a/>') }));
    const [stored] = runsOf(store.inputs, QUERY);
    assert.ok(stored !== undefined);
    const id = stored.id;
    store.verdicts.add([
        verdict({ run: id, check: 'I3', pass: true, at: 1 }),
        verdict({ run: id, check: 'I3', pass: false, critique: 'names nothing', at: 2 }),
        verdict({ run: id, check: 'I1', pass: true, at: 2 }),
        verdict({ run: id, item: null, check: 'coverage', pass: true, at: 2 }),
        verdict({ run: id, check: 'I3', pass: false, at: 3, source: 'operator', judge: 'operator' }),
        verdict({ run: id, check: 'I1', pass: true, at: 3, source: 'operator', judge: 'operator' }),
        verdict({ run: id, item: 't1/done/1', check: 'I3', pass: true, at: 3, source: 'operator', judge: 'operator' }),
    ]);
    assert.equal(store.verdicts.ofRun(id).length, 7);
    assert.deepEqual(store.verdicts.ofRun(id).find((v) => v.critique !== null), { ...verdict({ run: id, check: 'I3', pass: false, critique: 'names nothing', at: 2 }) });
    assert.deepEqual([...store.verdicts.labelled()].toSorted(), [`${id}|t1/done/0`, `${id}|t1/done/1`]);
    assert.deepEqual(store.verdicts.pairs().toSorted(byCheck), [{ check: 'I1', judge: 'pass', operator: 'pass' }, { check: 'I3', judge: 'fail', operator: 'fail' }]);
    assert.throws(() => { store.verdicts.add([verdict({ run: runIdOf('nonsense') })]); }, /not a run id/);
    assert.equal(store.verdicts.ofRun(id).length, 7, 'a failed batch writes nothing');
});

test('retention: a brief retention of none deletes every checked brief at the daily upkeep, the newest included', () => {
    const store = memoryStore();
    store.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
    const now = 100 * DAY;
    const decision = store.decisions.record({ scope: tabId('w1:t1'), key: paneId('w1:p1'), agent: agentKind('claude'), at: instant(now), mode: 'shadow', share: countOf(50), tokens: must(parseCount(5)), window: must(parseCount(10)), gate: 'ask', verdict: 'compact', askedVerdict: 'compact', answers: new Map(), coverage: null, coverageOutcome: null, coverageMs: null, coverageCostUsd: null, laneStatus: null, decider: null, costUsd: must(parseUsd(0)), tookMs: null, why: null });
    store.autocompactBriefs.put(decision, textOf('fresh brief'), [], [], instant(now));
    const clock = now;
    const retention = new InputRetention({ inputs: store.inputs, briefs: store.autocompactBriefs, clock: { now: (): ReturnType<typeof instant> => instant(clock) }, days: (): Count => countOf(14), briefRetention: (): BriefRetention => ({ kind: 'none' }), log: (): void => undefined });
    retention.tick();
    assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM autocompact_brief').get()?.['count'], 0);
});
