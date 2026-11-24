import type { ParseFailure } from '@stateforge-labs/session-ledger';
import { err, ok, type Result } from '@stateforge-labs/session-ledger';

interface HandoffRowOf<Outcome, Reason, Storable, Exit, Message> {
    readonly outcome: Outcome;
    readonly reason: Reason;
    readonly storable: Storable;
    readonly exit: Exit;
    readonly message: Message;
}

const outcomeRow = <const Outcome, const Reason, const Storable, const Exit, const Message>(
    outcome: Outcome,
    reason: Reason,
    storable: Storable,
    exit: Exit,
    message: Message,
): HandoffRowOf<Outcome, Reason, Storable, Exit, Message> => ({ outcome, reason, storable, exit, message });

export const HANDOFF_OUTCOME_ROWS = [
    outcomeRow('delivered', null, true, 0, 'delivered'),
    outcomeRow('printed', null, false, 0, null),
    outcomeRow('refused', 'source-unavailable', true, 1, 'refused.sourceUnavailable'),
    outcomeRow('refused', 'task-ambiguous', true, 1, 'refused.taskAmbiguous'),
    outcomeRow('refused', 'source-equals-target', true, 1, 'refused.sourceEqualsTarget'),
    outcomeRow('refused', 'not-a-lane', true, 1, 'refused.notALane'),
    outcomeRow('refused', 'status-not-ready', true, 1, 'refused.statusNotReady'),
    outcomeRow('refused', 'in-flight', true, 1, 'refused.inFlight'),
    outcomeRow('refused', 'lane-busy', true, 1, 'refused.laneBusy'),
    outcomeRow('refused', 'typing-lease-busy', true, 1, 'refused.typingLeaseBusy'),
    outcomeRow('refused', 'content-empty', true, 1, 'refused.contentEmpty'),
    outcomeRow('refused', 'ledger-empty', true, 1, 'refused.ledgerEmpty'),
    outcomeRow('refused', 'too-large', true, 1, 'refused.tooLarge'),
    outcomeRow('refused', 'daemon-not-running', false, 1, 'refused.daemonNotRunning'),
    outcomeRow('refused', 'daemon-outdated', false, 1, 'refused.daemonOutdated'),
    outcomeRow('unsupported', 'no-plan', true, 1, 'unsupported.noPlan'),
    outcomeRow('failed', 'transport', true, 1, 'failed.transport'),
    outcomeRow('failed', 'unconfirmed', true, 1, 'failed.unconfirmed'),
    outcomeRow('failed', 'internal-error', true, 1, 'failed.internalError'),
    outcomeRow('failed', 'source-unreadable', true, 1, 'failed.sourceUnreadable'),
    outcomeRow('failed', 'expired', true, 1, 'failed.expired'),
    outcomeRow('failed', 'interrupted', true, 1, 'failed.interrupted'),
    outcomeRow('failed', 'not-answered-withdrawn', false, 1, 'failed.notAnswered'),
    outcomeRow('failed', 'not-answered-taken', false, 1, 'failed.notAnsweredMayDeliver'),
] as const;

const HANDOFF_OUTCOMES: readonly HandoffOutcome[] = [
    { kind: 'delivered' },
    { kind: 'printed' },
    { kind: 'refused', reason: 'source-unavailable' },
    { kind: 'refused', reason: 'task-ambiguous' },
    { kind: 'refused', reason: 'source-equals-target' },
    { kind: 'refused', reason: 'not-a-lane' },
    { kind: 'refused', reason: 'status-not-ready' },
    { kind: 'refused', reason: 'in-flight' },
    { kind: 'refused', reason: 'lane-busy' },
    { kind: 'refused', reason: 'typing-lease-busy' },
    { kind: 'refused', reason: 'content-empty' },
    { kind: 'refused', reason: 'ledger-empty' },
    { kind: 'refused', reason: 'too-large' },
    { kind: 'refused', reason: 'daemon-not-running' },
    { kind: 'refused', reason: 'daemon-outdated' },
    { kind: 'unsupported', reason: 'no-plan' },
    { kind: 'failed', reason: 'transport' },
    { kind: 'failed', reason: 'unconfirmed' },
    { kind: 'failed', reason: 'internal-error' },
    { kind: 'failed', reason: 'source-unreadable' },
    { kind: 'failed', reason: 'expired' },
    { kind: 'failed', reason: 'interrupted' },
    { kind: 'failed', reason: 'not-answered-withdrawn' },
    { kind: 'failed', reason: 'not-answered-taken' },
];

export const USAGE_EXIT = 2;

export type HandoffOutcomeRow = (typeof HANDOFF_OUTCOME_ROWS)[number];
export type HandoffOutcomeKind = HandoffOutcomeRow['outcome'];
export type HandoffReason = Exclude<HandoffOutcomeRow['reason'], null>;
export type HandoffMessageKey = Exclude<HandoffOutcomeRow['message'], null>;
export type HandoffExitCode = HandoffOutcomeRow['exit'];

type Kinded<Kind> = { readonly kind: Kind };

type Reasoned<Kind, Reason> = { readonly kind: Kind; readonly reason: Reason };

type OutcomeOf<Row extends HandoffOutcomeRow> = Row extends { readonly reason: null }
    ? Kinded<Row['outcome']>
    : Reasoned<Row['outcome'], Exclude<Row['reason'], null>>;

export type HandoffOutcome = OutcomeOf<HandoffOutcomeRow>;

export type StoredHandoffOutcome = OutcomeOf<Extract<HandoffOutcomeRow, { readonly storable: true }>>;

const reasonOf = (outcome: HandoffOutcome): HandoffReason | null => ('reason' in outcome ? outcome.reason : null);

const rowFor = (kind: HandoffOutcomeKind, reason: HandoffReason | null): HandoffOutcomeRow | undefined =>
    HANDOFF_OUTCOME_ROWS.find((row) => row.outcome === kind && row.reason === reason);

const rowOf = (outcome: HandoffOutcome): HandoffOutcomeRow | undefined => rowFor(outcome.kind, reasonOf(outcome));

const requiredRowOf = (outcome: HandoffOutcome): HandoffOutcomeRow => {
    const row = rowOf(outcome);
    if (row === undefined) {
        const reason = reasonOf(outcome);
        throw new Error(`no handoff outcome row for ${reason === null ? outcome.kind : `${outcome.kind} ${reason}`}`);
    }
    return row;
};

export function parseHandoffOutcome(kind: unknown, reason: unknown): Result<HandoffOutcome, ParseFailure> {
    const outcome = HANDOFF_OUTCOMES.find((candidate) => candidate.kind === kind && reasonOf(candidate) === reason);
    return outcome === undefined ? err({ kind: 'out-of-range' }) : ok(outcome);
}

export const isStorable = (outcome: HandoffOutcome): outcome is StoredHandoffOutcome => rowOf(outcome)?.storable === true;

export function parseStoredHandoffOutcome(kind: unknown, reason: unknown): Result<StoredHandoffOutcome, ParseFailure> {
    const parsed = parseHandoffOutcome(kind, reason);
    return parsed.kind === 'ok' && isStorable(parsed.value) ? ok(parsed.value) : err({ kind: 'out-of-range' });
}


const INTERNAL_FAILURE: StoredHandoffOutcome = { kind: 'failed', reason: 'internal-error' };

export const storedOf = (outcome: HandoffOutcome): StoredHandoffOutcome => (isStorable(outcome) ? outcome : INTERNAL_FAILURE);

export function exitCodeOf(outcome: HandoffOutcome): HandoffExitCode {
    return requiredRowOf(outcome).exit;
}

export function messageKeyOf(outcome: HandoffOutcome): HandoffMessageKey | null {
    return requiredRowOf(outcome).message;
}
