// The plugin's own events on herdr's stream: `tab-recap-event` = `<seq>:<kind>[:<detail>]`, written on the lane's pane (or every workspace's, for the daemon).
// Pure. `<seq>` starts at the daemon's start time in base 36 and rises by one per pane (or workspace), so a restart never reuses a number and a
// subscriber that sees a gap knows it missed one. The state tokens stay the current truth.

export const EVENT_TOKEN = 'tab-recap-event';
/** an event token is kept an hour: a stale one says nothing new, and the state tokens are the truth */
export const EVENT_TTL_MS = 3_600_000;
export const VALUE_MAX = 80;

export const EVENT_KINDS = [
    'recap-written', 'needs-raised', 'needs-cleared', 'compact-queued', 'compact-running', 'compact-done', 'compact-failed',
    'autocompact-decided', 'autocompact-skipped', 'lane-closed', 'daemon-started', 'daemon-stopping',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** The sequence number of the n-th event of a pane (or workspace), counted from the daemon's start (epoch ms). */
export const seqOf = (startedAt: number, n: number): string => (startedAt + n).toString(36);

/** The whole value, cut to what a herdr token value holds. */
export function eventValue(seq: string, kind: EventKind, detail?: string | null): string {
    const tail = detail === undefined || detail === null || detail === '' ? '' : `:${detail}`;
    return `${seq}:${kind}${tail}`.slice(0, VALUE_MAX);
}
