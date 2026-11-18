const parts = (at: number, zone: string): Readonly<Record<string, string>> =>
    Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at)).map((part) => [part.type, part.value]));

export function localTime(at: number, now: number, zone: string): string {
    const [then, today] = [at, now].map((ms) => { try { return parts(ms, zone); } catch { return parts(ms, 'UTC'); } }) as [Record<string, string>, Record<string, string>];
    const clock = `${then['hour']}:${then['minute']}`;
    return then['day'] === today['day'] && then['month'] === today['month'] && then['year'] === today['year'] ? clock : `${then['year']}-${then['month']}-${then['day']} ${clock}`;
}

export const isoSecond = (at: number): string => new Date(at).toISOString().replace(/\.\d{3}Z$/, 'Z');
