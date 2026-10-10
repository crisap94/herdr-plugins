import type { Fact } from '#src/recap/domain/fact.ts';

const formatIn = (timeZone: string): Intl.DateTimeFormat => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function partsOf(at: number, zone: string): { readonly day: string; readonly clock: string } {
    let found: Intl.DateTimeFormat;
    try {
        found = formatIn(zone);
    } catch {
        found = formatIn('UTC');
    }
    const parts = Object.fromEntries(found.formatToParts(new Date(at)).map((part) => [part.type, part.value]));
    return { day: `${parts['year']}-${parts['month']}-${parts['day']}`, clock: `${parts['hour']}:${parts['minute']}` };
}

export const clockOf = (at: number, zone: string): string => partsOf(at, zone).clock;

export const dayOf = (at: number, zone: string): string => partsOf(at, zone).day;

export interface Entry {
    readonly fact: Fact;
    readonly drawnAt: number;
    readonly closed: NonNullable<Fact['closedWhy']> | null;
}

const orderedBy = (fact: Fact): number => fact.closedAt ?? fact.lastAt;

export function timelineOf(facts: readonly Fact[]): readonly Entry[] {
    return facts
        .filter((fact) => fact.section === 'done' || fact.state === 'closed')
        .toSorted((a, b) => orderedBy(b) - orderedBy(a))
        .map((fact) => (fact.section === 'done' ? { fact, drawnAt: fact.firstAt, closed: null } : { fact, drawnAt: fact.closedAt ?? fact.lastAt, closed: fact.closedWhy }));
}

export function dateLines(times: readonly number[], now: number, zone: string): readonly (string | null)[] {
    const today = dayOf(now, zone);
    return times.map((at, index) => {
        const day = dayOf(at, zone);
        const previous = index === 0 ? today : dayOf(times[index - 1] ?? at, zone);
        return day === previous ? null : day;
    });
}
