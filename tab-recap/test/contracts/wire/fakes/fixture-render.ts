import type { Intent } from '#src/wire/view/keys.ts';
import type { Role } from '#src/wire/view/protocol.ts';

export const FIXTURE_BODY_LINES = 12;

const heightOf = (rows: number): number => Math.max(3, rows);

const widthOf = (cols: number): number => Math.max(10, cols - 2);

export function fixtureClamp(rows: number, scroll: number): number {
    return Math.max(0, Math.min(scroll, FIXTURE_BODY_LINES - (heightOf(rows) - 1)));
}

export function fixtureRender(role: Role, tab: string, cols: number, rows: number, scroll: number): string[] {
    const width = widthOf(cols);
    const top = fixtureClamp(rows, scroll);
    const footer = `${role} ${tab} ${cols}x${rows} @${top}`.slice(0, width);
    if (role === 'bar') {
        return [`${tab} bar ${cols}x${rows}`.slice(0, width)];
    }
    const body = Array.from({ length: heightOf(rows) - 1 }, (_, index) => {
        const number = top + index + 1;
        return number <= FIXTURE_BODY_LINES ? `${tab} line ${number}`.slice(0, width) : '';
    });
    return [...body, footer];
}

export function fixtureIntents(): { seen: Intent[]; sink(i: Intent): void } {
    const seen: Intent[] = [];
    return { seen, sink: (intent: Intent): void => { seen.push(intent); } };
}
