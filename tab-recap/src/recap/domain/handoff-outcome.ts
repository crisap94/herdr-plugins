export const HANDOFF_OUTCOME_ROWS = [
    { outcome: 'delivered', reason: null, storable: true, exit: 0, message: 'delivered' },
    { outcome: 'printed', reason: null, storable: false, exit: 0, message: null },
    { outcome: 'refused', reason: 'source-unavailable', storable: true, exit: 1, message: 'refused.sourceUnavailable' },
    { outcome: 'refused', reason: 'task-ambiguous', storable: true, exit: 1, message: 'refused.taskAmbiguous' },
    { outcome: 'refused', reason: 'source-equals-target', storable: true, exit: 1, message: 'refused.sourceEqualsTarget' },
    { outcome: 'refused', reason: 'not-a-lane', storable: true, exit: 1, message: 'refused.notALane' },
    { outcome: 'refused', reason: 'status-not-ready', storable: true, exit: 1, message: 'refused.statusNotReady' },
    { outcome: 'refused', reason: 'in-flight', storable: true, exit: 1, message: 'refused.inFlight' },
    { outcome: 'refused', reason: 'lane-busy', storable: true, exit: 1, message: 'refused.laneBusy' },
    { outcome: 'refused', reason: 'typing-lease-busy', storable: true, exit: 1, message: 'refused.typingLeaseBusy' },
    { outcome: 'refused', reason: 'content-empty', storable: true, exit: 1, message: 'refused.contentEmpty' },
    { outcome: 'refused', reason: 'ledger-empty', storable: true, exit: 1, message: 'refused.ledgerEmpty' },
    { outcome: 'refused', reason: 'too-large', storable: true, exit: 1, message: 'refused.tooLarge' },
    { outcome: 'refused', reason: 'daemon-not-running', storable: false, exit: 1, message: 'refused.daemonNotRunning' },
    { outcome: 'refused', reason: 'daemon-outdated', storable: false, exit: 1, message: 'refused.daemonOutdated' },
    { outcome: 'unsupported', reason: 'no-plan', storable: true, exit: 1, message: 'unsupported.noPlan' },
    { outcome: 'failed', reason: 'transport', storable: true, exit: 1, message: 'failed.transport' },
    { outcome: 'failed', reason: 'unconfirmed', storable: true, exit: 1, message: 'failed.unconfirmed' },
    { outcome: 'failed', reason: 'internal-error', storable: true, exit: 1, message: 'failed.internalError' },
    { outcome: 'failed', reason: 'source-unreadable', storable: true, exit: 1, message: 'failed.sourceUnreadable' },
    { outcome: 'failed', reason: 'expired', storable: true, exit: 1, message: 'failed.expired' },
    { outcome: 'failed', reason: 'interrupted', storable: true, exit: 1, message: 'failed.interrupted' },
    { outcome: 'failed', reason: 'not-answered-withdrawn', storable: false, exit: 1, message: 'failed.notAnswered' },
    { outcome: 'failed', reason: 'not-answered-taken', storable: false, exit: 1, message: 'failed.notAnsweredMayDeliver' },
] as const;

export const USAGE_EXIT = 2;

export type HandoffOutcomeRow = (typeof HANDOFF_OUTCOME_ROWS)[number];
export type HandoffOutcomeKind = HandoffOutcomeRow['outcome'];
export type HandoffReason = Exclude<HandoffOutcomeRow['reason'], null>;
export type HandoffMessageKey = Exclude<HandoffOutcomeRow['message'], null>;
export type HandoffExitCode = HandoffOutcomeRow['exit'];

type OutcomeOfRow<Row extends HandoffOutcomeRow> = Row extends { readonly reason: infer Reason extends string }
    ? { readonly kind: Row['outcome']; readonly reason: Reason }
    : { readonly kind: Row['outcome'] };

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

export function exitCodeOf(outcome: HandoffOutcome): HandoffExitCode {
    return requiredRowOf(outcome).exit;
}

export function messageKeyOf(outcome: HandoffOutcome): HandoffMessageKey | null {
    return requiredRowOf(outcome).message;
}

export const isStorablePair = (kind: string, reason: string | null): boolean => storedOutcomeOf(kind, reason) !== null;
