import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messagesFor } from '#src/i18n/index.ts';
import { HANDOFF_OUTCOME_ROWS, USAGE_EXIT, exitCodeOf, handoffOutcomeOf, isStorable, messageKeyOf, storedOutcomeOf } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffMessageKey, HandoffOutcome, HandoffOutcomeRow, StoredHandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';

const outcomeFor = (row: HandoffOutcomeRow): HandoffOutcome => handoffOutcomeOf(row.outcome, row.reason) ?? assert.fail(`no outcome for ${row.outcome}`);

const MESSAGE_KEYS: readonly HandoffMessageKey[] = HANDOFF_OUTCOME_ROWS.flatMap((row) => (row.message === null ? [] : [row.message]));

const labelOf = (outcome: HandoffOutcome): string => {
    switch (outcome.kind) {
        case 'delivered':
            return 'delivered';
        case 'printed':
            return 'printed';
        case 'refused':
            return `refused ${outcome.reason}`;
        case 'unsupported':
            return `unsupported ${outcome.reason}`;
        case 'failed':
            return `failed ${outcome.reason}`;
        default: {
            const exhaustive: never = outcome;
            return exhaustive;
        }
    }
};

test('every outcome row has an exit code of 0 or 1, and the usage error is exit 2', () => {
    for (const row of HANDOFF_OUTCOME_ROWS) {
        assert.ok([0, 1].includes(row.exit), `${row.outcome} ${row.reason}`);
    }
    assert.equal(USAGE_EXIT, 2);
});

test('every outcome row with a message key has text in both catalogs, and printed is the only row without one', () => {
    assert.deepEqual(HANDOFF_OUTCOME_ROWS.filter((row) => row.message === null).map((row) => row.outcome), ['printed']);
    for (const key of MESSAGE_KEYS) {
        for (const locale of ['en', 'es'] as const) {
            const text: unknown = messagesFor(locale).cli.handoff[key];
            assert.equal(typeof text, 'string', `${locale} ${key}`);
            assert.notEqual((text as string).trim(), '', `${locale} ${key}`);
        }
    }
});

test('each catalog carries exactly the message keys of the outcome table', () => {
    for (const locale of ['en', 'es'] as const) {
        assert.deepEqual(Object.keys(messagesFor(locale).cli.handoff).toSorted(), [...MESSAGE_KEYS].toSorted(), locale);
    }
});

test('the union derives from the table: five outcome kinds, and every row yields an outcome of its own kind', () => {
    assert.deepEqual([...new Set(HANDOFF_OUTCOME_ROWS.map((row) => row.outcome))].toSorted(),['delivered', 'failed', 'printed', 'refused', 'unsupported']);
    for (const row of HANDOFF_OUTCOME_ROWS) {
        assert.equal(outcomeFor(row).kind, row.outcome);
    }
});

test('a switch over the outcome union covers every kind and fails to compile when one is missing', () => {
    assert.deepEqual(HANDOFF_OUTCOME_ROWS.map((row) => labelOf(outcomeFor(row))), [
        'delivered', 'printed',
        'refused source-unavailable', 'refused task-ambiguous', 'refused source-equals-target', 'refused not-a-lane',
        'refused status-not-ready', 'refused in-flight', 'refused lane-busy', 'refused typing-lease-busy', 'refused content-empty',
        'refused ledger-empty', 'refused too-large', 'refused daemon-not-running', 'refused daemon-outdated',
        'unsupported no-plan',
        'failed transport', 'failed unconfirmed', 'failed internal-error', 'failed source-unreadable', 'failed expired',
        'failed interrupted', 'failed not-answered-withdrawn', 'failed not-answered-taken',
    ]);
});

test('unsupported has the single reason no-plan, and the CLI-only reasons are exactly the four the table marks', () => {
    assert.deepEqual(HANDOFF_OUTCOME_ROWS.filter((row) => row.outcome === 'unsupported').map((row) => row.reason), ['no-plan']);
    assert.deepEqual(HANDOFF_OUTCOME_ROWS.filter((row) => !row.storable).map((row) => row.reason), [null, 'daemon-not-running', 'daemon-outdated', 'not-answered-withdrawn', 'not-answered-taken']);
});

test('printed is not in the storable set, and interrupted is a storable failure', () => {
    assert.equal(storedOutcomeOf('printed', null), null);
    assert.equal(isStorable({ kind: 'printed' }), false);
    assert.notEqual(storedOutcomeOf('failed', 'interrupted'), null);
    assert.equal(storedOutcomeOf('delivered', null)?.kind, 'delivered');
});

test('a reason the table does not mark storable cannot be stored, and every storable row is', () => {
    for (const row of HANDOFF_OUTCOME_ROWS) {
        assert.equal(storedOutcomeOf(row.outcome, row.reason) !== null, row.storable, `${row.outcome} ${row.reason}`);
    }
    assert.equal(storedOutcomeOf('refused', 'not-a-reason'), null);
    assert.equal(storedOutcomeOf('delivered', 'expired'), null);
});

test('the stored outcome type has no CLI-only reason', () => {
    // @ts-expect-error daemon-not-running is CLI-only and is not a storable reason
    const refused: StoredHandoffOutcome = { kind: 'refused', reason: 'daemon-not-running' };
    assert.equal(storedOutcomeOf(refused.kind, 'reason' in refused ? refused.reason : null), null);
});

test('the exit mapping covers every row: delivered and printed exit 0, everything else 1', () => {
    for (const row of HANDOFF_OUTCOME_ROWS) {
        assert.equal(exitCodeOf(outcomeFor(row)), row.exit, `${row.outcome} ${row.reason}`);
    }
    assert.equal(exitCodeOf({ kind: 'delivered' }), 0);
    assert.equal(exitCodeOf({ kind: 'printed' }), 0);
    assert.equal(exitCodeOf({ kind: 'refused', reason: 'lane-busy' }), 1);
    assert.equal(exitCodeOf({ kind: 'unsupported', reason: 'no-plan' }), 1);
    assert.equal(exitCodeOf({ kind: 'failed', reason: 'expired' }), 1);
});

test('the message key maps each outcome to its row, and printed has none', () => {
    assert.equal(messageKeyOf({ kind: 'printed' }), null);
    assert.equal(messageKeyOf({ kind: 'delivered' }), 'delivered');
    assert.equal(messageKeyOf({ kind: 'refused', reason: 'source-equals-target' }), 'refused.sourceEqualsTarget');
    assert.equal(messageKeyOf({ kind: 'failed', reason: 'not-answered-taken' }), 'failed.notAnsweredMayDeliver');
});
