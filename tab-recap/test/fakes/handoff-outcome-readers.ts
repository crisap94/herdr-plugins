import { parseHandoffOutcome, parseStoredHandoffOutcome, type HandoffOutcome, type StoredHandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';

export const handoffOutcomeOf = (kind: string, reason: string | null): HandoffOutcome | null => {
    const parsed = parseHandoffOutcome(kind, reason);
    return parsed.kind === 'ok' ? parsed.value : null;
};

export const storedOutcomeOf = (kind: string, reason: string | null): StoredHandoffOutcome | null => {
    const parsed = parseStoredHandoffOutcome(kind, reason);
    return parsed.kind === 'ok' ? parsed.value : null;
};
