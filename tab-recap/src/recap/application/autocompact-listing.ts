// `tab-recap autocompact`: the newest decisions as a table, read-only. Pure: decisions in, lines out.
import { parseArgs } from 'node:util';
import type { Skip, StoredDecision } from '#src/ports/autocompact-records.ts';
import { moneyOf } from './autocompact-line.ts';

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

const rowOf = (found: StoredDecision, zone: string): readonly string[] => [
    stamp(found.at, zone), found.tab, found.pane, `${found.share} %`, found.verdict, found.gate, found.decider ?? '—', moneyOf(found.costUsd),
];

const HEAD = ['time', 'tab', 'pane', 'share', 'verdict', 'gate', 'decider', 'cost'] as const;
const SKIPPED = ['time', 'tab', 'pane', 'share', 'gate', 'detail'] as const;

const skippedRow = (found: Skip, zone: string): readonly string[] => [
    stamp(found.at, zone), found.tab, found.pane, found.share === null ? '—' : `${found.share} %`, found.gate, found.detail ?? '—',
];

/** The rows under their head, each column padded to its widest cell. */
function table(head: readonly string[], rows: readonly (readonly string[])[]): readonly string[] {
    const all = [head, ...rows];
    const widths = head.map((_, at) => Math.max(...all.map((row) => (row[at] ?? '').length)));
    return all.map((row) => row.map((cell, at) => cell.padEnd(widths[at] ?? 0)).join('  ').trimEnd());
}

/** The decisions as a table, then `last 24 h: N decisions, $X`; then, when a lane is stopped, `not decided now` and the stopped lanes (newest first, their gate and detail). Nothing to list says so. */
export function listing(decisions: readonly StoredDecision[], spent: { readonly since: number; readonly costUsd: number }, now: number, zone: string, skips: readonly Skip[] = []): readonly string[] {
    const inDay = decisions.filter((found) => found.at >= now - DAY_MS).length;
    const total = `last 24 h: ${inDay} decision${inDay === 1 ? '' : 's'}, ${moneyOf(spent.costUsd)}`;
    const decided = decisions.length === 0 ? ['no autocompact decisions yet', total] : [...table(HEAD, decisions.map((found) => rowOf(found, zone))), '', total];
    const stopped = skips.length === 0 ? [] : ['', 'not decided now', ...table(SKIPPED, skips.map((found) => skippedRow(found, zone)))];
    return [...decided, ...stopped];
}
