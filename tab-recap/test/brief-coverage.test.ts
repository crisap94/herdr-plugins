import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '#src/i18n/en.ts';
import { correctionOf, covered, factsOf, linesOf, missingOf, questionsFor } from '#src/recap/application/brief-coverage.ts';
import type { Coverage } from '#src/recap/application/brief-coverage.ts';
import { Compaction } from '#src/recap/application/compaction.ts';
import { compactionPlans } from '#src/adapters/compaction-plan-registry.ts';
import type { CompactionDeps } from '#src/recap/application/compaction.ts';
import { CompactionClaims } from '#src/recap/application/compaction-claims.ts';
import { targetOf } from '#src/recap/domain/compaction.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import type { Decider, DecidedResult, Noul } from '#src/ports/decider.ts';
import type { HistoryFact } from '#src/ports/ledger.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { memoryStore, must } from './db/support.ts';
import { oneTask } from './support.ts';

const fact = (section: string, text: string, why: string | null = null, state: 'open' | 'closed' = 'open'): HistoryFact => ({ section, text, why, state, closedWhy: null, closedAt: null, firstAt: 1, lastAt: 2 });
const HISTORY = [fact('goal', 'Ship the cart rewrite'), fact('decisions', 'Keep SQLite', 'one file'), fact('next', 'Tag the release'), fact('done', 'Merged !12'), fact('rules', 'Never push to main', null, 'closed')];

function deciding(answers: Readonly<Record<string, number>>, fallback = 0.95): Decider & { asked: Record<string, Noul>[] } {
    const asked: Record<string, Noul>[] = [];
    return { label: 'fake', asked, ask: (_state, questions): Promise<DecidedResult> => { asked.push({ ...questions }); return Promise.resolve({ kind: 'decided', answers: Object.fromEntries(Object.keys(questions).map((id) => [id, answers[id] ?? fallback])), tokens: 1, costUsd: 0, tookMs: 1, model: 'fake' }); } };
}

test('the facts: the open goal, now, needs, decisions, next and rules, in the ledger\'s order, at most 40', () => {
    assert.deepEqual(factsOf(HISTORY).map((each) => each.section), ['goal', 'decisions', 'next']);
    assert.equal(factsOf(Array.from({ length: 60 }, (_, i) => fact('next', `t${i}`))).length, 40);
});

test('the questions: keeps_<i> per fact, reason_<i> per decision with a reason; each names its fact\'s fields in backticks', () => {
    const questions = questionsFor(factsOf(HISTORY));
    assert.deepEqual(Object.keys(questions), ['keeps_0', 'keeps_1', 'reason_1', 'keeps_2']);
    assert.match(JSON.stringify(questions['keeps_1']?.instructions), /`brief`.*`facts\[1\]\.text`/);
    assert.match(JSON.stringify(questions['reason_1']?.instructions), /`facts\[1\]\.why`/);
});

test('missing: a goal, needs, decisions or rules fact (or a decision\'s reason) below 0.70; now and next never block', () => {
    const facts = factsOf(HISTORY);
    assert.deepEqual(linesOf(missingOf({ keeps_0: 0.69, keeps_1: 0.7, reason_1: 0.7, keeps_2: 0.1 }, facts)), ['goal: Ship the cart rewrite']);
    assert.deepEqual(linesOf(missingOf({ keeps_0: 1, keeps_1: 0.95, reason_1: 0.2, keeps_2: 0.4 }, facts)), ['the reason for the decision: Keep SQLite (one file)']);
    assert.deepEqual(linesOf(missingOf({ keeps_0: 1, keeps_1: 1, reason_1: 1, keeps_2: 0.4 }, facts)), []);
});

test('covered: the brief and the facts are the one state; ok when nothing blocks; a decider that cannot answer is not ok and says why', async () => {
    const decider = deciding({ keeps_2: 0.4 });
    assert.deepEqual(await covered('the brief', factsOf(HISTORY), decider), { ok: true, missing: [], missingFacts: [], answers: { keeps_0: 0.95, keeps_1: 0.95, reason_1: 0.95, keeps_2: 0.4 }, unknown: null, costUsd: 0 });
    const broken: Decider = { label: 'x', ask: () => Promise.resolve(unknown({ why: 'timeout', after: 10_000 as never })) };
    const result = await covered('b', factsOf(HISTORY), broken);
    assert.deepEqual([result.ok, result.missing, result.unknown], [false, [], 'timed out after 10000 ms']);
    assert.deepEqual(await covered('b', [], broken), { ok: true, missing: [], missingFacts: [], answers: {}, unknown: null });
    assert.match(correctionOf(['goal: Ship it']), /did not keep these.*\n- goal: Ship it$/s);
});

const NOW = Date.parse('2026-10-07T10:00:00Z');

interface World { readonly typed: string[]; readonly briefs: (string | undefined)[]; readonly toasts: string[]; readonly store: ReturnType<typeof memoryStore> }

function flow(checks: readonly Coverage[], withCoverage = true, template: { readonly why: string | null } | null = null, ceilingOverride = true, history = HISTORY): { world: World; compaction: Compaction } {
    const store = memoryStore();
    store.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
    const world: World = { typed: [], briefs: [], toasts: [], store };
    let checked = 0;
    const recap = { ...blankRecap('w1:t1'), tasks: oneTask('x', NO_SECTIONS, ['w1:p1']) };
    const deps: CompactionDeps = {
        compactionPlans,
        claims: new CompactionClaims(),
        agents: { status: () => Promise.resolve({ kind: 'agent', agent: 'claude', status: 'idle' }), prompt: () => Promise.resolve({ kind: 'sent' }), typeLine: (_pane, line) => { world.typed.push(line.pieces.map(String).join('')); return Promise.resolve({ kind: 'sent' }); }, askNote: () => Promise.resolve({ kind: 'done' }) },
        notifier: { notify: (title, body) => { world.toasts.push(`${title} | ${body}`); return Promise.resolve({ kind: 'shown' }); } },
        records: { readRecap: () => recap }, ledger: { historyOf: () => history }, boundaries: { lastBreakAt: () => null }, compactions: store.compactions,
        settling: { settled: () => Promise.resolve({ kind: 'settled', status: 'done' }) },
        brief: { enabled: () => true, job: () => 'fake', write: (_doc, _own, correction) => { world.briefs.push(correction); return Promise.resolve(template === null ? { text: correction === undefined ? 'first brief' : 'second brief', why: null } : { text: null, why: template.why }); } },
        coverage: () => (withCoverage ? { check: () => Promise.resolve(must(checks[Math.min(checked++, checks.length - 1)])) } : null),
        decisions: store.autocompact,
        ceilingOverride: () => ceilingOverride,
        checkedBriefs: store.autocompactBriefs,
        recent: () => Promise.resolve([{ role: 'user', text: 'go' }]), marks: () => Promise.resolve([{ kind: 'compacted', at: NOW + 5000 }]), pause: () => Promise.resolve(), now: () => NOW,
        webs: { of: () => null }, lanes: () => [laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude' })], focused: () => Promise.resolve('w1:p1'),
        refresh: () => Promise.resolve(), target: () => targetOf('focused'), messages: () => en, log: () => undefined,
    };
    return { world, compaction: new Compaction(deps) };
}

const OK: Coverage = { ok: true, missing: [], missingFacts: [], answers: { keeps_0: 0.9 }, unknown: null };
const MISSING: Coverage = { ok: false, missing: ['decisions: Keep SQLite'], missingFacts: [{ index: 1, fact: { section: 'decisions', text: 'Keep SQLite', why: null }, parts: ['text'] }], answers: { keeps_1: 0.2 }, unknown: null };

function decided(world: World, gate: 'ask' | 'ceiling' = 'ask'): string {
    const id = world.store.autocompact.record({ tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', at: NOW - 1000, mode: 'on', share: gate === 'ceiling' ? 84 : 62, tokens: 1, window: 2, gate, verdict: 'compact', askedVerdict: 'compact', answers: {}, coverage: null, coverageOutcome: null, coverageMs: null, coverageCostUsd: null, decider: 'fake', costUsd: 0, tookMs: 1, why: null });
    return id;
}

test('an automatic compaction whose brief misses a fact is written again once with the correction, then typed when it is covered', async () => {
    const { world, compaction } = flow([MISSING, OK]);
    decided(world);
    await compaction.run({ tab: 'w1:t1', pane: null, note: null, origin: 'auto' });
    assert.equal(world.briefs.length, 2);
    assert.match(world.briefs[1] ?? '', /did not keep these.*decisions: Keep SQLite/s);
    assert.equal(world.typed.length, 1);
    assert.match(world.typed[0] ?? '', /^\/compact /);
    assert.match(world.toasts.join('\n'), /Compact claude \(auto\)/);
});

test('a ceiling lane types its rewrite and appends the missing fact, keeping the compact ceiling decision', async () => {
    const { world, compaction } = flow([MISSING]);
    const id = decided(world, 'ceiling');
    await compaction.run({ tab: 'w1:t1', pane: null, note: null, origin: 'auto' });
    assert.equal(world.typed.length, 1);
    assert.match(world.typed[0] ?? '', /Facts not carried into the brief/);
    assert.match(world.typed[0] ?? '', /decisions: Keep SQLite/);
    const row = must(world.store.autocompact.newest(1)[0]);
    assert.deepEqual([row.id, row.gate, row.verdict, row.askedVerdict], [id, 'ceiling', 'compact', 'compact']);
    assert.equal(row.coverageOutcome?.kind, 'missed');
});

test('a ceiling lane with no decider types the writer brief and records the unchecked outcome', async () => {
    const { world, compaction } = flow([], false);
    decided(world, 'ceiling');
    await compaction.run({ tab: 'w1:t1', pane: null, note: null, origin: 'auto' });
    assert.equal(world.typed.length, 1);
    assert.equal(world.store.autocompact.newest(1)[0]?.coverageOutcome?.kind, 'unchecked');
});

test('the ceiling switch off keeps the failed check blocking', async () => {
    const { world, compaction } = flow([MISSING], true, null, false);
    decided(world, 'ceiling');
    await compaction.run({ tab: 'w1:t1', pane: null, note: null, origin: 'auto' });
    assert.deepEqual([world.typed.length, world.store.autocompact.newest(1)[0]?.gate, world.store.autocompact.newest(1)[0]?.verdict], [0, 'coverage', 'wait']);
});

test('the ceiling appendix follows the section order and remains within its character cap', async () => {
    const history = [
        { ...HISTORY[0]!, section: 'decisions', text: 'new decision', why: 'latest reason', lastAt: 9 },
        { ...HISTORY[0]!, section: 'needs', text: 'need '.repeat(45), why: null },
        { ...HISTORY[0]!, section: 'rules', text: 'rule '.repeat(45), why: null },
        { ...HISTORY[0]!, section: 'goal', text: 'goal '.repeat(45), why: null },
        { ...HISTORY[0]!, section: 'decisions', text: 'old decision', why: 'older reason', lastAt: 2 },
    ];
    const missing = history.map((entry) => `${entry.section}: ${entry.text}`);
    const result: Coverage = { ok: false, missing, missingFacts: history.map((entry, index) => ({ index, fact: { section: entry.section, text: entry.text, why: entry.why }, parts: ['text'] })), answers: {}, unknown: null };
    const { world, compaction } = flow([result], true, null, true, history);
    decided(world, 'ceiling');
    await compaction.run({ tab: 'w1:t1', pane: null, note: null, origin: 'auto' });
    const text = world.typed[0] ?? '';
    const appendix = text.slice(text.indexOf('Facts not carried into the brief'));
    assert.ok(appendix.length <= 1500);
    assert.ok(appendix.indexOf('goal:') < appendix.indexOf('rules:'));
    assert.ok(appendix.indexOf('rules:') < appendix.indexOf('needs:'));
    assert.ok(appendix.indexOf('needs:') < appendix.indexOf('new decision'));
    assert.ok(appendix.indexOf('new decision') < appendix.indexOf('old decision'));
});

test('the covered automatic compaction is an `auto` record, and its decision points at it with the coverage', async () => {
    const { world, compaction } = flow([MISSING, OK]);
    const id = decided(world);
    await compaction.run({ tab: 'w1:t1', pane: null, note: null, origin: 'auto' });
    const record = must(world.store.compactions.shownFor('w1:t1')[0]);
    assert.deepEqual([record.origin, record.stage, record.brief], ['auto', 'compacted', 'written']);
    const row = must(world.store.autocompact.newest(1)[0]);
    assert.deepEqual([row.id, row.compactionId, row.verdict, row.coverage], [id, record.id, 'compact', OK.answers]);
});

test('still missing after the rewrite: nothing is typed, the record is skipped with `coverage`, the decision is a coverage wait pointing at it', async () => {
    const { world, compaction } = flow([MISSING]);
    decided(world);
    await compaction.run({ tab: 'w1:t1', pane: null, note: null, origin: 'auto' });
    assert.deepEqual(world.typed, []);
    assert.equal(world.briefs.length, 2, 'one rewrite, no more');
    const [record] = world.store.compactions.shownFor('w1:t1');
    assert.deepEqual([record?.stage, record?.why, record?.origin], ['skipped', 'coverage', 'auto']);
    const [row] = world.store.autocompact.newest(1);
    assert.deepEqual([row?.verdict, row?.gate, row?.compactionId], ['wait', 'coverage', record?.id]);
    assert.equal(world.store.autocompact.lastDecisionAt('w1:t1', 'w1:p1'), NOW - 1000);
});

test('a decider that cannot be reached leaves the brief unchecked: no rewrite, no typing, a coverage wait', async () => {
    const { world, compaction } = flow([{ ok: false, missing: [], missingFacts: [], answers: {}, unknown: 'timed out after 10000 ms' }]);
    decided(world);
    await compaction.run({ tab: 'w1:t1', pane: null, note: null, origin: 'auto' });
    assert.deepEqual([world.typed.length, world.briefs.length, world.store.autocompact.newest(1)[0]?.gate], [0, 1, 'coverage'], 'unchecked: no rewrite, and the decision waits');
    assert.equal(world.store.compactions.shownFor('w1:t1')[0]?.stage, 'skipped');
});

test('the operator\'s compaction runs no coverage and records the operator as its origin', async () => {
    const operator = flow([MISSING]);
    await operator.compaction.run({ tab: 'w1:t1', pane: null, note: null });
    assert.deepEqual([operator.world.typed.length, operator.world.briefs.length, operator.world.store.compactions.shownFor('w1:t1')[0]?.origin], [1, 1, 'operator']);
});

test('an automatic compaction with no decider fails closed: nothing typed, the decision waits for coverage with the reason', async () => {
    const unchecked = flow([MISSING], false);
    decided(unchecked.world);
    await unchecked.compaction.run({ tab: 'w1:t1', pane: null, note: null, origin: 'auto' });
    assert.deepEqual([unchecked.world.typed.length, unchecked.world.briefs.length], [0, 1]);
    assert.equal(unchecked.world.store.compactions.shownFor('w1:t1')[0]?.stage, 'skipped');
    const [row] = unchecked.world.store.autocompact.newest(1);
    assert.deepEqual([row?.verdict, row?.gate, row?.why, row?.coverage], ['wait', 'coverage', 'no decider is set up', null]);
});

test('an automatic compaction whose brief is the template (no brief written) fails closed: nothing typed, the decision waits with the brief\'s reason', async () => {
    const template = flow([OK], true, { why: 'the brief job is off' });
    decided(template.world);
    await template.compaction.run({ tab: 'w1:t1', pane: null, note: null, origin: 'auto' });
    assert.deepEqual([template.world.typed.length, template.world.briefs.length], [0, 1], 'the template is not typed for an automatic compaction');
    const [row] = template.world.store.autocompact.newest(1);
    assert.deepEqual([row?.verdict, row?.gate, row?.why], ['wait', 'coverage', 'the brief job is off']);
});

test('the operator\'s template compaction is typed as before, unchecked, with the operator as origin', async () => {
    const operator = flow([MISSING], true, { why: 'the brief job is off' });
    await operator.compaction.run({ tab: 'w1:t1', pane: null, note: null });
    assert.deepEqual([operator.world.typed.length, operator.world.store.compactions.shownFor('w1:t1')[0]?.origin], [1, 'operator']);
});
