// Instants as the operator reads them: HH:MM in the tab's zone, with the date when it is not today.

const parts = (at: number, zone: string): Readonly<Record<string, string>> =>
    Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at)).map((part) => [part.type, part.value]));

/** `21:58`, or `2026-10-05 21:58` when `at` is not the same day as `now` in `zone`. An unknown zone reads as UTC. */
export function localTime(at: number, now: number, zone: string): string {
    const [then, today] = [at, now].map((ms) => { try { return parts(ms, zone); } catch { return parts(ms, 'UTC'); } }) as [Record<string, string>, Record<string, string>];
    const clock = `${then['hour']}:${then['minute']}`;
    return then['day'] === today['day'] && then['month'] === today['month'] && then['year'] === today['year'] ? clock : `${then['year']}-${then['month']}-${then['day']} ${clock}`;
}

/** UTC ISO 8601 to the second: `2026-10-06T03:05:00Z`. */
export const isoSecond = (at: number): string => new Date(at).toISOString().replace(/\.\d{3}Z$/, 'Z');
