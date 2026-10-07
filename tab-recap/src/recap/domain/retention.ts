// How long a closed tab's data is kept, pure.

export const DEFAULT_KEEP_DAYS = 30;
const DAY_MS = 86_400_000;

/** `TAB_RECAP_KEEP_DAYS`: whole days (`0` keeps everything); anything else is the default. */
export function tabKeepDaysOf(raw: string | undefined): number {
    const days = Number(raw);
    return raw !== undefined && raw.trim() !== '' && Number.isInteger(days) && days >= 0 ? days : DEFAULT_KEEP_DAYS;
}

/** A tab last seen before this instant is expired; null when nothing ever expires. */
export const cutoffOf = (now: number, days: number): number | null => (days === 0 ? null : now - days * DAY_MS);
