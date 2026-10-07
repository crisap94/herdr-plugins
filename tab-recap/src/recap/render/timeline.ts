// The expanded view's timeline and its clock: which facts it holds, in which order, and when each one is drawn. Pure.
import type { Fact } from '#src/recap/domain/fact.ts';

const formatIn = (timeZone: string): Intl.DateTimeFormat => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** A moment in the tab's zone, as the parts the view draws; an unknown zone reads as UTC. */
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

/** `14:02` */
export const clockOf = (at: number, zone: string): string => partsOf(at, zone).clock;

/** `2026-10-07`, the date line over the entries of a day that is not today */
export const dayOf = (at: number, zone: string): string => partsOf(at, zone).day;

/** One line of the timeline: when it is drawn, the fact, and why it closed when it closed and is not a "done" fact. */
export interface Entry {
    readonly fact: Fact;
    /** when the entry is drawn: a done fact when it happened, a closed one when it closed */
    readonly drawnAt: number;
    readonly closed: NonNullable<Fact['closedWhy']> | null;
}

/** The newest end of a fact's life: when it closed, else when it was last confirmed. */
const orderedBy = (fact: Fact): number => fact.closedAt ?? fact.lastAt;

/**
 * Done facts (open and closed) and every closed fact of the other sections, newest first. A done fact is drawn at the time
 * it happened; a closed one of another section at the time it closed, marked with why.
 */
export function timelineOf(facts: readonly Fact[]): readonly Entry[] {
    return facts
        .filter((fact) => fact.section === 'done' || fact.state === 'closed')
        .toSorted((a, b) => orderedBy(b) - orderedBy(a))
        .map((fact) => (fact.section === 'done' ? { fact, drawnAt: fact.firstAt, closed: null } : { fact, drawnAt: fact.closedAt ?? fact.lastAt, closed: fact.closedWhy }));
}

/** The date lines to put over entries drawn at these times: the day changes, or the first one is not today. */
export function dateLines(times: readonly number[], now: number, zone: string): readonly (string | null)[] {
    const today = dayOf(now, zone);
    return times.map((at, index) => {
        const day = dayOf(at, zone);
        const previous = index === 0 ? today : dayOf(times[index - 1] ?? at, zone);
        return day === previous ? null : day;
    });
}
