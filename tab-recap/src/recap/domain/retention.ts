import type { Brand } from './brand.ts';
import type { Instant } from './time.ts';

export const DEFAULT_KEEP_DAYS = 30;
const DAY_MS = 86_400_000;

export type ClosedLaneDays = Brand<number, 'ClosedLaneDays'>;

export const CLOSED_LANE_DAYS_MAX_DIGITS = 9;
export const DEFAULT_CLOSED_LANE_DAYS = 14 as ClosedLaneDays;

const WHOLE_DAYS = new RegExp(`^[0-9]{1,${CLOSED_LANE_DAYS_MAX_DIGITS}}$`);

export function tabKeepDaysOf(raw: string | undefined): number {
    const days = Number(raw);
    return raw !== undefined && raw.trim() !== '' && Number.isInteger(days) && days >= 0 ? days : DEFAULT_KEEP_DAYS;
}

export function closedLaneDaysOf(raw: unknown): ClosedLaneDays {
    const text = typeof raw === 'string' ? raw.trim() : '';
    return WHOLE_DAYS.test(text) ? (Number(text) as ClosedLaneDays) : DEFAULT_CLOSED_LANE_DAYS;
}

export function inWindow(closedAt: Instant, now: Instant, days: ClosedLaneDays): boolean {
    return days !== 0 && closedAt >= now - days * DAY_MS;
}

export const cutoffOf = (now: number, days: number): number | null => (days === 0 ? null : now - days * DAY_MS);
