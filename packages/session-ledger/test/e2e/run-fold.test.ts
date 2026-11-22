import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accomplishedOf, foldedRun, throwingLedger } from '@stateforge-labs/session-ledger/unstable/recap/application/run-fold.ts';
import { brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import type { Fact, TaskId } from '@stateforge-labs/session-ledger/unstable/recap/domain/fact.ts';
import type { Operation } from '@stateforge-labs/session-ledger/unstable/recap/domain/ops.ts';
import type { CheckedLedger } from '@stateforge-labs/session-ledger/unstable/ports/ledger.ts';
import { unknown, type Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';
import { instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import { text } from '@stateforge-labs/session-ledger/testkit';

const HOUR = 3_600_000;
const AT = 100 * HOUR;
const OWNER = { tab: 'tab-1' };

const factOf = (id: string, over: Partial<Fact> = {}): Fact => ({
    id: brand<string, 'FactId'>(id), task: { ...OWNER, key: 'a' }, section: 'now', text: id, why: null, ref: null, agent: null, anchor: null,
    firstAt: 1, lastAt: 1, state: 'open', closedWhy: null, closedAt: null, language: 'en', ...over,
});

const ledgerOf = (facts: readonly Fact[]): { openOf(task: TaskId): readonly Fact[]; recentlyClosed(task: TaskId, sinceMs: number): readonly Fact[] } => ({
    openOf: (task) => facts.filter((fact) => fact.task.key === task.key && fact.state === 'open'),
    recentlyClosed: (task, sinceMs) => facts.filter((fact) => fact.task.key === task.key && fact.state === 'closed' && (fact.closedAt ?? 0) >= sinceMs),
});

const runOf = (minted: string[]): { readonly owner: typeof OWNER; readonly at: number; readonly language: string; mint(): Fact['id'] } => ({
    owner: OWNER, at: AT, language: 'es', mint: () => brand<string, 'FactId'>(minted.shift() ?? 'none'),
});

const close = (id: string): Operation => ({ op: 'close', id, why: 'done' });

test('an add gets the minted id and the run at and language', () => {
    const add: Operation = { op: 'add', section: 'needs', text: 'ship it', why: null, ref: null, at: null, agent: null };
    const folded = foldedRun(ledgerOf([]), [{ task: 'a', ops: [add] }], runOf(['fct_new']));
    assert.deepEqual(folded.refused, []);
    assert.deepEqual(folded.changed.map((fact) => [fact.id, fact.task, fact.firstAt, fact.lastAt, fact.language]), [['fct_new', { tab: 'tab-1', key: 'a' }, AT, AT, 'es']]);
});

test('a close of an id the ledger does not hold is refused as unknown-id', () => {
    const folded = foldedRun(ledgerOf([]), [{ task: 'a', ops: [close('fct_missing')] }], runOf([]));
    assert.deepEqual(folded.changed, []);
    assert.deepEqual(folded.refused, [{ op: close('fct_missing'), reason: 'unknown-id' }]);
});

test('a fact closed 25 hours before the run is outside the fold, one closed 23 hours before is inside', () => {
    const old = factOf('fct_old', { state: 'closed', closedWhy: 'done', closedAt: AT - 25 * HOUR });
    const recent = factOf('fct_recent', { state: 'closed', closedWhy: 'done', closedAt: AT - 23 * HOUR });
    const folded = foldedRun(ledgerOf([old, recent]), [{ task: 'a', ops: [close('fct_old'), close('fct_recent')] }], runOf([]));
    assert.deepEqual(folded.refused.map((refusal) => refusal.reason), ['unknown-id', 'closed']);
});

test('throwingLedger turns an unknown read into an error that says why', () => {
    const checked: CheckedLedger = {
        openOf: () => ({ kind: 'unknown', why: { why: 'not-found', what: text('the ledger') } }),
        recentlyClosed: () => [],
        allOf: () => [],
        keysOf: () => [],
        historyOf: () => [],
    };
    assert.throws(() => throwingLedger(checked).openOf({ ...OWNER, key: 'a' }), { message: 'the ledger not found' });
});

test('accomplishedOf reports the done facts that are new after the run, and an unknown read reports nothing and logs once', () => {
    const task = { id: 'a', name: 'A', lanes: [] };
    const old = factOf('fct_old', { section: 'done' });
    const fresh = factOf('fct_new', { section: 'done' });
    const logged: string[] = [];
    const unreported = (failure: Unknown): void => { logged.push(failure.why.why); };
    assert.deepEqual(accomplishedOf([{ task, facts: [old] }], [{ task, facts: [old, fresh] }], instant(AT), unreported).map((item) => item.fact.id), ['fct_new']);
    assert.deepEqual(logged, []);
    assert.deepEqual(accomplishedOf([{ task, facts: [old] }], [{ task, facts: unknown({ why: 'not-found', what: text('the ledger') }) }], instant(AT), unreported), []);
    assert.deepEqual(logged, ['not-found']);
});
