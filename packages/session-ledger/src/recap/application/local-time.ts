import { brand } from '#src/recap/domain/brand.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';

type ClockParts = Readonly<Record<'year' | 'month' | 'day' | 'hour' | 'minute', Text>>;

export type LocalClock = (at: Instant) => Text;

const textOf = brand<string, 'Text'>;

const parts = (at: Instant, zone: Text): ClockParts => {
    const found = new Map(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at)).map((part) => [part.type, part.value]));
    const named = (type: keyof ClockParts): Text => textOf(String(found.get(type)));
    return { year: named('year'), month: named('month'), day: named('day'), hour: named('hour'), minute: named('minute') };
};

const partsIn = (at: Instant, zone: Text): ClockParts => {
    try {
        return parts(at, zone);
    } catch {
        return parts(at, textOf('UTC'));
    }
};

export function localTime(at: Instant, now: Instant, zone: Text): Text {
    const [then, today] = [partsIn(at, zone), partsIn(now, zone)];
    const clock = `${then['hour']}:${then['minute']}`;
    return textOf(then['day'] === today['day'] && then['month'] === today['month'] && then['year'] === today['year'] ? clock : `${then['year']}-${then['month']}-${then['day']} ${clock}`);
}

export const isoSecond = (at: Instant): Text => textOf(new Date(at).toISOString().replace(/\.\d{3}Z$/, 'Z'));
