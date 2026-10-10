export const EVENT_TOKEN = 'tab-recap-event';
export const EVENT_TTL_MS = 3_600_000;
export const VALUE_MAX = 80;

export const EVENT_KINDS = [
    'recap-written', 'needs-raised', 'needs-cleared', 'compact-queued', 'compact-running', 'compact-done', 'compact-failed',
    'autocompact-decided', 'autocompact-skipped', 'lane-closed', 'daemon-started', 'daemon-stopping',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const seqOf = (startedAt: number, n: number): string => (Math.floor(startedAt) + n).toString(36);

export function eventValue(seq: string, kind: EventKind, detail?: string | null): string {
    const tail = detail === undefined || detail === null || detail === '' ? '' : `:${detail}`;
    return `${seq}:${kind}${tail}`.slice(0, VALUE_MAX);
}
