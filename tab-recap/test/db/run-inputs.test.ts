// Stored inputs, gate counts and verdicts through the real repositories: the round trip, the retention, the pairs the agreement is made of.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { InputRetention } from '#src/recap/application/input-retention.ts';
import type { GateStats } from '#src/recap/domain/gates/index.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { RecordedRun } from '#src/ports/recap-records.ts';
import type { Pair, Verdict } from '#src/ports/verdicts.ts';
import { cursor, memoryStore } from './support.ts';
import { oneTask, withFacts } from '#test/support.ts';

const DAY = 86_400_000;
const STATS: GateStats = { refused: { G1: 2 }, flagged: { G8: 1 }, dropped: 1 };
const SECTIONS = { goal: 'Ship retries', now: ['Review !256.'], needs: [], done: ['Merged !250.', 'Tagged 1.9.0.'], decisions: [], next: [], links: ['!256'], rules: [] };

const run = (at: number, extra: Partial<RecordedRun> = {}): RecordedRun => ({
    tab: 'w1:t1', at, cause: 'requested', backend: 'fake', language: 'en', costUsd: 0, error: null, lanes: [cursor('w1:p1')], ...withFacts(oneTask('', SECTIONS)), ...extra,
});

const QUERY = { tab: null, since: null, limit: 20, withInput: false } as const;

test('a run keeps its input document (inflated equal, bytes = uncompressed length) and its gate counts', () => {
    const store = memoryStore();
    const document = '<recap_input version="1">é — ✓ </recap_input>'.repeat(40);
    store.records.recordRun(run(1000, { input: document, gateStats: STATS }));
    const [stored] = store.inputs.runs(QUERY);
    assert.ok(stored !== undefined);
    assert.deepEqual([stored.tab, stored.at, stored.hasInput, stored.gateStats], ['w1:t1', 1000, true, STATS]);
    assert.equal(store.inputs.document(stored.id), document);
    const row = store.db.prepare('SELECT document, bytes FROM run_input').get() as { document: Uint8Array; bytes: number };
    assert.equal(row.bytes, Buffer.byteLength(document));
    assert.ok(row.document.length < row.bytes, 'compressed');
    assert.deepEqual(Buffer.from(row.document).subarray(0, 2), gzipSync('x').subarray(0, 2), 'gzip');
});

test('a run without an input or counts is listed (not as judgeable) and a failed run is not listed at all', () => {
    const store = memoryStore();
    store.records.recordRun(run(1000));
    store.records.failRun({ tab: 'w1:t1', at: 2000, cause: 'requested', backend: 'fake', language: 'en', costUsd: 0, error: 'boom', lanes: [cursor('w1:p1')] });
    const listed = store.inputs.runs(QUERY);
    assert.deepEqual(listed.map((r) => [r.at, r.hasInput, r.gateStats]), [[1000, false, null]]);
    assert.deepEqual(store.inputs.runs({ ...QUERY, withInput: true }), []);
});

test('runs come newest first, by tab and by time, with a limit; the items carry their keys in the recap\'s order', () => {
    const store = memoryStore();
    store.records.recordRun(run(1000, { input: '<a/>' }));
    store.records.recordRun(run(2000, { input: '<b/>' }));
    store.records.recordRun(run(3000, { tab: 'w1:t2', input: '<c/>', lanes: [cursor('w1:p2')] }));
    assert.deepEqual(store.inputs.runs(QUERY).map((r) => r.at), [3000, 2000, 1000]);
    assert.deepEqual(store.inputs.runs({ ...QUERY, tab: 'w1:t1' }).map((r) => r.at), [2000, 1000]);
    assert.deepEqual(store.inputs.runs({ ...QUERY, since: 2000 }).map((r) => r.at), [3000, 2000]);
    assert.deepEqual(store.inputs.runs({ ...QUERY, limit: 1 }).map((r) => r.at), [3000]);
    const [newest] = store.inputs.runs({ ...QUERY, tab: 'w1:t1' });
    assert.ok(newest !== undefined);
    assert.deepEqual(store.inputs.itemsOf(newest.id).map((item) => [item.key, item.text]), [
        ['t1/goal/0', 'Ship retries'], ['t1/now/0', 'Review !256.'], ['t1/done/0', 'Merged !250.'], ['t1/done/1', 'Tagged 1.9.0.'], ['t1/links/0', '!256'],
    ]);
    assert.deepEqual(store.inputs.itemsOf('run_nonsense'), []);
    assert.equal(store.inputs.document('run_nonsense'), null);
});

test('gate counts since a time, newest first, only for runs that have them', () => {
    const store = memoryStore();
    store.records.recordRun(run(1000));
    store.records.recordRun(run(2000, { gateStats: STATS }));
    store.records.recordRun(run(3000, { gateStats: { refused: {}, flagged: {}, dropped: 0 } }));
    assert.deepEqual(store.inputs.gateCounts(null).map((entry) => entry.at), [3000, 2000]);
    assert.deepEqual(store.inputs.gateCounts(2500).map((entry) => entry.at), [3000]);
});

test('retention: the daily upkeep deletes a 15-day-old input and keeps the run, and keeps a 13-day-old one; it runs once a day; 0 keeps none', () => {
    const store = memoryStore();
    const now = 100 * DAY;
    store.records.recordRun(run(now - 15 * DAY, { input: '<old/>' }));
    store.records.recordRun(run(now - 13 * DAY, { input: '<recent/>' }));
    let clock = now;
    const lines: string[] = [];
    const days = { value: 14 };
    const retention = new InputRetention({ inputs: store.inputs, clock: { now: (): ReturnType<typeof instant> => instant(clock) }, days: (): number => days.value, log: (line): void => { lines.push(line); } });
    assert.equal(retention.tick(), 1);
    assert.deepEqual(store.inputs.runs(QUERY).map((r) => [r.at, r.hasInput]), [[now - 13 * DAY, true], [now - 15 * DAY, false]], 'the run stays, its input is gone');
    assert.match(lines.join(), /deleted 1 stored run input older than 14 days/);
    clock += 3_600_000;
    days.value = 0;
    assert.equal(retention.tick(), 0, 'once a day');
    clock += DAY;
    assert.equal(retention.tick(), 1, 'zero days keeps none');
    assert.deepEqual(store.inputs.runs({ ...QUERY, withInput: true }), []);
});

const byCheck = (a: Pair, b: Pair): number => a.check.localeCompare(b.check);

const verdict = (over: Partial<Verdict>): Verdict => ({ run: 'run_x', item: 't1/done/0', check: 'I3', pass: true, critique: null, judge: 'claude · sonnet · medium', at: 1, source: 'judge', ...over });

test('verdicts round-trip, one transaction; operator labels are found; pairs join judge and operator on the same item and check, newest of each', () => {
    const store = memoryStore();
    store.records.recordRun(run(1000, { input: '<a/>' }));
    const [stored] = store.inputs.runs(QUERY);
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
    assert.deepEqual(store.verdicts.pairs().toSorted(byCheck), [{ check: 'I1', judge: true, operator: true }, { check: 'I3', judge: false, operator: false }]);
    assert.throws(() => { store.verdicts.add([verdict({ run: 'nonsense' })]); }, /not a run id/);
    assert.equal(store.verdicts.ofRun(id).length, 7, 'a failed batch writes nothing');
});
