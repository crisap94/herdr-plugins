// `tab-recap autocompact`: the newest decisions as a table, read-only. Pure: decisions in, lines out.
import { parseArgs } from 'node:util';
import type { StoredDecision } from '#src/ports/autocompact-records.ts';

export const AUTOCOMPACT_USAGE = 'USAGE: tab-recap autocompact [--all]';
export const LISTED = 20;
const DAY_MS = 24 * 60 * 60_000;

export type ParsedListing = { readonly kind: 'options'; readonly all: boolean } | { readonly kind: 'usage'; readonly why: string };

/** `--all` (every tab, which is also what no option does) and nothing else. */
export function parseListing(argv: readonly string[]): ParsedListing {
    try {
        const { values, positionals } = parseArgs({ args: [...argv], allowPositionals: true, strict: true, options: { all: { type: 'boolean' } } });
        return positionals.length > 0 ? { kind: 'usage', why: `unexpected ${positionals[0] ?? ''}` } : { kind: 'options', all: values.all === true };
    } catch (error) {
        return { kind: 'usage', why: error instanceof Error ? error.message : String(error) };
    }
}

/** `10-08 11:59` in the given zone. */
function stamp(at: number, zone: string): string {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at).map((part) => [part.type, part.value]));
    return `${parts['month']}-${parts['day']} ${parts['hour']}:${parts['minute']}`;
}
const money = (usd: number): string => (usd === 0 ? '$0' : `$${usd.toFixed(5)}`);

const rowOf = (found: StoredDecision, zone: string): readonly string[] => [
    stamp(found.at, zone), found.tab, found.pane, `${found.share} %`, found.verdict, found.gate, found.decider ?? '—', money(found.costUsd),
];

const HEAD = ['time', 'tab', 'pane', 'share', 'verdict', 'gate', 'decider', 'cost'] as const;

/** The table (columns padded to their widest cell), then `last 24 h: N decisions, $X`. Nothing to list says so. */
export function listing(decisions: readonly StoredDecision[], spent: { readonly since: number; readonly costUsd: number }, now: number, zone: string): readonly string[] {
    const inDay = decisions.filter((found) => found.at >= now - DAY_MS).length;
    const total = `last 24 h: ${inDay} decision${inDay === 1 ? '' : 's'}, ${money(spent.costUsd)}`;
    if (decisions.length === 0) return ['no autocompact decisions yet', total];
    const rows = [HEAD, ...decisions.map((found) => rowOf(found, zone))];
    const widths = HEAD.map((_, at) => Math.max(...rows.map((row) => (row[at] ?? '').length)));
    return [...rows.map((row) => row.map((cell, at) => cell.padEnd(widths[at] ?? 0)).join('  ').trimEnd()), '', total];
}
