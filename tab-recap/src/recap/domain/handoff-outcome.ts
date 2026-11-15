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

export const USAGE_EXIT = 2;

export type HandoffOutcomeRow = (typeof HANDOFF_OUTCOME_ROWS)[number];
export type HandoffOutcomeKind = HandoffOutcomeRow['outcome'];
export type HandoffReason = Exclude<HandoffOutcomeRow['reason'], null>;
export type HandoffMessageKey = Exclude<HandoffOutcomeRow['message'], null>;
export type HandoffExitCode = HandoffOutcomeRow['exit'];

interface ReasonedOutcome<Kind, Reason> {
    readonly kind: Kind;
    readonly reason: Reason;
}

interface PlainOutcome<Kind> {
    readonly kind: Kind;
}

type OutcomeOfRow<Row extends HandoffOutcomeRow> = Row extends { readonly reason: infer Reason extends string }
    ? ReasonedOutcome<Row['outcome'], Reason>
    : PlainOutcome<Row['outcome']>;

export type HandoffOutcome = OutcomeOfRow<HandoffOutcomeRow>;
export type StoredHandoffOutcome = OutcomeOfRow<Extract<HandoffOutcomeRow, { readonly storable: true }>>;

const reasonOf = (outcome: HandoffOutcome): string | null => ('reason' in outcome ? outcome.reason : null);

const rowFor = (kind: string, reason: string | null): HandoffOutcomeRow | undefined =>
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

const outcomeOfRow = (row: HandoffOutcomeRow): HandoffOutcome =>
    (row.reason === null ? { kind: row.outcome } : { kind: row.outcome, reason: row.reason }) as HandoffOutcome;

export function handoffOutcomeOf(kind: string, reason: string | null): HandoffOutcome | null {
    const row = rowFor(kind, reason);
    return row === undefined ? null : outcomeOfRow(row);
}

export const isStorable = (outcome: HandoffOutcome): outcome is StoredHandoffOutcome => rowOf(outcome)?.storable === true;

export function storedOutcomeOf(kind: string, reason: string | null): StoredHandoffOutcome | null {
    const outcome = handoffOutcomeOf(kind, reason);
    return outcome !== null && isStorable(outcome) ? outcome : null;
}

const INTERNAL_FAILURE: StoredHandoffOutcome = { kind: 'failed', reason: 'internal-error' };

export const storedOf = (outcome: HandoffOutcome): StoredHandoffOutcome => (isStorable(outcome) ? outcome : INTERNAL_FAILURE);

export function exitCodeOf(outcome: HandoffOutcome): HandoffExitCode {
    return requiredRowOf(outcome).exit;
}

export function messageKeyOf(outcome: HandoffOutcome): HandoffMessageKey | null {
    return requiredRowOf(outcome).message;
}
