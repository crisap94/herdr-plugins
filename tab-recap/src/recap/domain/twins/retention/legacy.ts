import type { Instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';

const DAY_MS = 86_400_000;
const DEFAULT_KEEP_DAYS = 30;

export function tabKeepDaysOf(raw: string | undefined): number {
    const days = Number(raw);
    return raw !== undefined && raw.trim() !== '' && Number.isInteger(days) && days >= 0 ? days : DEFAULT_KEEP_DAYS;
}

export const cutoffOf = (now: Instant, days: number): number | null => (days === 0 ? null : now - days * DAY_MS);
