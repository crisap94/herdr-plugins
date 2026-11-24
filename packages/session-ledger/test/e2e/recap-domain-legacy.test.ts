import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AUTO_ORDER, BACKEND_IDS, backendRecord, HARNESS_BY_ID, enumeratesJob, environmentName, harnessChoiceLabels, harnessLabels, hasAvailabilityMark, hasModel, INSTALLABLE_HARNESS_NAMES, installableHarnessSentence, JOB_HARNESSES, jobContractOf, jobEnvironmentNames, LEGACY_MODEL_KEYS, MODEL_DEFAULTS, modelOf, pick } from '@stateforge-labs/session-ledger/unstable/recap/domain/backend.ts';
import { chapterStart, compactedFrom, PLUGIN_WITHIN_MS, settledBefore, triggerOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/boundary.ts';
import { COMPACTABLE, compactableKinds, contextOf, HINT_DEFAULT, HINT_MAX, HINT_MIN, hintFor, hintOf, hintSetting, shareOf, sizeOf, targetOf, targetSetting, tokensOf, windowOf, windowSetting } from '@stateforge-labs/session-ledger/unstable/recap/domain/compaction.ts';
import { DEBOUNCE_OFF, debounceOf, parseDebounce } from '@stateforge-labs/session-ledger/unstable/recap/domain/debounce.ts';
import { CLOSED_WHY, isClosedWhy, isOpen, isSection, sameTask, SECTION_IDS, WRITER_CLOSES, type Fact, type FactId, factIdOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/fact.ts';
import { causeOf, failureCauseOf, parseFailureCause, parseThrown } from '@stateforge-labs/session-ledger/unstable/recap/domain/failure-cause.ts';
import { ANCHOR_CHARS, quotedIn as anchorQuotedIn } from '@stateforge-labs/session-ledger/unstable/recap/domain/gates/g11-anchor.ts';
import { keptGrouping } from '@stateforge-labs/session-ledger/unstable/recap/domain/grouping.ts';
import { awaitedNames, backgroundItem, holdingDetail, joinedDetail, keptDetail, overridingDetail, backgroundLabel, backgroundTool, flightDetail, flightOf, flightReason, foregroundOf, holdsLane, NO_RUNNING, NOT_AWAITING, NOTHING_IN_FLIGHT, observedFrom, runningCount, unreadable, ceilingOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/in-flight.ts';
import { apply, sweepOf, fold, foldSwept } from '@stateforge-labs/session-ledger/unstable/recap/domain/ops.ts';
import { DEFAULT_PIPELINE, parsePipeline, pipelineOf, PIPELINES, retriesTargeted } from '@stateforge-labs/session-ledger/unstable/recap/domain/pipeline.ts';
import { pieceOf, QUOTE_CHARS, quotedIn } from '@stateforge-labs/session-ledger/unstable/recap/domain/quote.ts';
import { EVIDENCE_CHARS, reconciliationOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/reconciliation.ts';
import { capable, kindsWith, REGISTERED_KINDS, REGISTERED_NAMES, registeredKindOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/registered-kinds.ts';
import { CAPS, MAX_WORDS, NO_SECTIONS } from '@stateforge-labs/session-ledger/unstable/recap/domain/shape.ts';
import { duration, elapsed, instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import { keepNewestOf, nextHoursOf, positiveCount } from '@stateforge-labs/session-ledger/unstable/recap/domain/writer-view.ts';
import { brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import { must } from '@stateforge-labs/session-ledger/unstable/protocol/result.ts';
import { parseText, textOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import { countOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/count.ts';
import { paneIdOf, tabIdOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/lane-shape.ts';

const TASK = { scope: tabIdOf('tab-1'), key: textOf('t1') };

const factOf = (id: string, section: Fact['section'], text: string): Fact => ({
    id: brand<string, 'FactId'>(id), task: TASK, section, text: textOf(text), why: null, ref: null, agent: null, anchor: null,
    firstAt: instant(1), lastAt: instant(1), state: 'open', closedWhy: null, closedAt: null, language: textOf('en'),
});

test('the backend table names each harness and picks the first available automatic one', () => {
    assert.deepEqual(BACKEND_IDS, ['claude', 'codex', 'opencode', 'custom']);
    assert.deepEqual(AUTO_ORDER, ['claude', 'codex', 'opencode']);
    assert.equal(JOB_HARNESSES.length, 4);
    assert.equal(MODEL_DEFAULTS.claude, 'haiku');
    assert.deepEqual(LEGACY_MODEL_KEYS, ['TAB_RECAP_CLAUDE_MODEL', 'TAB_RECAP_CODEX_MODEL']);
    assert.deepEqual(INSTALLABLE_HARNESS_NAMES, ['claude', 'codex', 'opencode']);
    assert.equal(installableHarnessSentence(), 'claude, codex or opencode');
    assert.equal(hasModel('custom'), false);
    assert.equal(modelOf('claude')?.default, 'haiku');
    assert.equal(enumeratesJob('custom'), false);
    assert.equal(hasAvailabilityMark('codex'), true);
    assert.equal(jobContractOf('custom'), 'free-text');
    assert.deepEqual(jobEnvironmentNames(JOB_HARNESSES), ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT']);
    assert.equal(harnessLabels((id) => id.length).opencode, 8);
    assert.equal(harnessChoiceLabels(textOf('my-cmd')).custom, 'my-cmd');
    assert.equal(pick('auto', [textOf('codex'), textOf('opencode')]), 'codex');
    assert.equal(pick('custom', []), 'custom');
    assert.equal(HARNESS_BY_ID.codex.label, 'codex');
    assert.equal(backendRecord((id) => id).custom, 'custom');
    assert.equal(environmentName(textOf('HOME')), 'HOME');
    assert.throws(() => environmentName(textOf(' ')));
});

test('a compaction boundary is a plugin one only within its window', () => {
    assert.equal(triggerOf(instant(1000), [instant(500)], null), 'plugin');
    assert.equal(triggerOf(instant(PLUGIN_WITHIN_MS + 2000), [instant(1000)], 'manual'), 'manual');
    const planned = compactedFrom([{ key: paneIdOf('p'), at: instant(20), cursor: countOf(2) }, { key: paneIdOf('p'), at: instant(10), cursor: countOf(1) }], instant(10), []);
    assert.deepEqual(planned.map(({ at, trigger }) => [at, trigger]), [[20, 'auto']]);
    assert.equal(chapterStart(instant(5), instant(9)), 9);
    assert.equal(settledBefore(instant(1), instant(2)), true);
    assert.equal(settledBefore(null, instant(2)), false);
});

test('the compaction settings read their words and the context share', () => {
    assert.deepEqual([...COMPACTABLE], ['claude', 'codex', 'opencode']);
    assert.deepEqual(compactableKinds(REGISTERED_KINDS), COMPACTABLE);
    assert.deepEqual(kindsWith(REGISTERED_KINDS, 'autocompactDefault'), ['claude']);
    assert.equal(registeredKindOf(textOf('codex')), 'codex');
    assert.equal(registeredKindOf(textOf('custom')), null);
    assert.deepEqual(REGISTERED_NAMES, ['claude', 'codex', 'opencode']);
    assert.equal(capable(true), true);
    assert.deepEqual(targetOf('Codex, claude'), { kind: 'kinds', kinds: ['codex', 'claude'] });
    assert.deepEqual(targetOf(undefined), { kind: 'focused' });
    assert.equal(targetSetting(textOf('all codex')), 'all');
    assert.deepEqual([HINT_MIN, HINT_DEFAULT, HINT_MAX], [10, 40, 95]);
    assert.equal(hintOf(textOf('50%')), 50);
    assert.equal(hintOf(textOf('off')), null);
    assert.equal(hintSetting(textOf('7')), '40');
    assert.equal(windowOf(textOf('200_000')), 200000);
    assert.equal(windowSetting(textOf('12')), '');
    const use = contextOf({ observed: { tokens: countOf(150_000), peak: countOf(0), window: null, model: null }, setting: null }, () => ({ window: countOf(100_000), source: 'table', sizes: [countOf(200_000)] }));
    assert.deepEqual(use, { tokens: 150_000, window: 200_000, source: 'observed' });
    assert.equal(shareOf({ tokens: countOf(150_000), window: countOf(200_000), source: 'observed' }), 75);
    assert.equal(hintFor(use, countOf(70)), 75);
    assert.equal(hintFor(use, countOf(80)), null);
    assert.equal(sizeOf(countOf(1_000_000)), '1M');
    assert.equal(tokensOf(countOf(1500)), '1.5k');
});

test('a debounce window is read in its range and off otherwise', () => {
    assert.deepEqual(debounceOf('10000'), { kind: 'window', window: duration(10_000) });
    assert.equal(debounceOf('10'), DEBOUNCE_OFF);
    assert.equal(parseDebounce(0), DEBOUNCE_OFF);
});

test('the fact vocabulary and the failure cause', () => {
    assert.equal(SECTION_IDS[0], 'goal');
    assert.ok(CLOSED_WHY.includes('merged'));
    assert.ok(!WRITER_CLOSES.includes('merged'));
    assert.equal(isSection('needs'), true);
    assert.equal(isClosedWhy('later'), false);
    assert.equal(sameTask(TASK, { ...TASK }), true);
    assert.equal(isOpen(factOf('f1', 'now', 'x')), true);
    const text = must(parseText('Boom'));
    assert.equal(causeOf(text), parseFailureCause(text));
    const failure = Object.assign(new TypeError('x'), { code: 'E_BAD' });
    assert.equal(failureCauseOf(parseThrown(failure)), 'TypeError: E_BAD');
    assert.equal(failureCauseOf(parseThrown('nope')), 'NonError');
});

test('grouping keeps the tasks and seats a new lane by its place', () => {
    const kept = keptGrouping([{ id: textOf('t1'), name: textOf(''), sessions: [paneIdOf('a')] }], [{ pane: paneIdOf('a'), place: textOf('/x/one') }, { pane: paneIdOf('b'), place: textOf('/y/two') }]);
    assert.deepEqual(kept, [{ id: 't1', sessions: ['a'], name: 'one' }, { id: 't2', sessions: ['b'], name: 'two' }]);
});

test('a flight holds its lane and says why', () => {
    assert.equal(NO_RUNNING, 0);
    assert.equal(runningCount(countOf(-2.5)), 0);
    const why = flightReason(textOf('busy'));
    const item = backgroundItem(backgroundTool(textOf('bash')), null);
    assert.equal(item.label, 'bash');
    assert.equal(backgroundLabel(textOf('l')), 'l');
    assert.deepEqual(foregroundOf(runningCount(countOf(0)), why), { kind: 'none' });
    const running = flightOf(observedFrom(runningCount(countOf(2)), [item], why), NOT_AWAITING);
    assert.equal(holdsLane(running, ceilingOf(false)), true);
    assert.equal(flightDetail(running, ceilingOf(false)), '2 running');
    const waiting = flightOf(NOTHING_IN_FLIGHT, { kind: 'on', names: awaitedNames(textOf('ci')) });
    assert.equal(holdsLane(waiting, ceilingOf(true)), false);
    assert.equal(flightDetail(waiting, ceilingOf(true)), 'ceiling-overrides-wait (awaiting ci)');
    assert.equal(flightDetail(flightOf(unreadable(why), NOT_AWAITING), ceilingOf(false)), 'busy');
    assert.equal(holdingDetail(waiting), 'awaiting ci');
    assert.deepEqual(overridingDetail(running), []);
    assert.equal(joinedDetail(keptDetail(running)), 'background: 1 kept running');
    assert.equal(joinedDetail([]), null);
});

test('apply adds, updates and closes facts, and refuses a second goal', () => {
    const run = { id: brand<string, 'RunId'>('r1'), task: TASK, at: instant(5), language: textOf('en'), mint: (): FactId => brand<string, 'FactId'>('f9') };
    const folded = apply([factOf('f1', 'now', 'old')], [
        { op: 'close', id: factIdOf('f1'), why: 'done' },
        { op: 'add', section: 'goal', text: textOf('one'), why: null, ref: null, at: null, agent: null },
        { op: 'add', section: 'goal', text: textOf('two'), why: null, ref: null, at: null, agent: null },
    ], run);
    assert.deepEqual(folded.ledger.map(({ id, state }) => [id, state]), [['f1', 'closed'], ['f9', 'open']]);
    assert.deepEqual(folded.refused.map(({ reason }) => reason), ['second-goal']);
    const now = [factOf('f1', 'now', 'old')];
    assert.equal(fold(now, [{ op: 'close', id: factIdOf('f2'), why: 'done' }], run).ledger[0]?.state, 'open');
    assert.equal(foldSwept(now, [{ op: 'close', id: factIdOf('f2'), why: 'done' }], run).ledger[0]?.closedWhy, 'superseded');
    assert.deepEqual(apply(now, [], run, sweepOf(true)).changed, []);
});

test('the pipeline words and the quotes', () => {
    assert.deepEqual(PIPELINES, ['one', 'enumerate', 'enumerate+gates', 'full']);
    assert.equal(DEFAULT_PIPELINE, 'one');
    assert.equal(pipelineOf(' FULL '), 'full');
    assert.equal(pipelineOf('none'), null);
    assert.equal(parsePipeline(3), null);
    assert.equal(retriesTargeted('enumerate'), false);
    assert.equal(QUOTE_CHARS, ANCHOR_CHARS);
    assert.equal(EVIDENCE_CHARS, 2 * ANCHOR_CHARS);
    assert.equal(quotedIn(textOf('the  build'), textOf('we ran the build twice')), true);
    assert.equal(anchorQuotedIn(textOf('ran'), textOf('we ran')), true);
    assert.equal(pieceOf(textOf('  short  ')), 'short');
});

test('a reconciliation keeps a grounded close and refuses an add', () => {
    const facts = new Map([[textOf('f1'), factOf('f1', 'now', 'build')]]);
    const answer = JSON.stringify({ ops: [{ op: 'close', id: 'f1', why: 'done', evidence: 'build passed' }, { op: 'add', id: 'f2' }] });
    const reconciled = reconciliationOf(textOf(answer), facts, textOf('the build passed today'));
    assert.deepEqual(reconciled.ops, [{ op: 'close', id: 'f1', why: 'done' }]);
    assert.equal(reconciled.refused.length, 1);
    assert.deepEqual(reconciliationOf(textOf('{'), facts, textOf('')).refused, ['the answer is not JSON']);
});

test('the recap shape caps its lists', () => {
    assert.equal(CAPS.links, 6);
    assert.equal(MAX_WORDS, 16);
    assert.equal(NO_SECTIONS.goal, '');
});

test('time brands its milliseconds and the writer view reads its counts in range', () => {
    assert.equal(elapsed(instant(5), instant(2)), duration(0));
    assert.equal(positiveCount(3), 3);
    assert.throws(() => positiveCount(0));
    assert.equal(keepNewestOf(50), 50);
    assert.throws(() => keepNewestOf(51));
    assert.equal(nextHoursOf(720), 720);
    assert.throws(() => nextHoursOf(1.5));
});
