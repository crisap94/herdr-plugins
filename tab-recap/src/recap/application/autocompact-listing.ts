import { parseArgs } from 'node:util';
import type { Skip, StoredDecision } from '#src/ports/autocompact-records.ts';
import { milliseconds, type AutocompactPolicy } from '#src/recap/domain/autocompact.ts';
import type { AutocompactTuning } from '#src/recap/domain/autocompact-style.ts';
import { moneyOf } from './autocompact-line.ts';
import type { Messages } from '#src/i18n/index.ts';
import { must, type Result } from '#src/protocol/result.ts';
import { parseInstant, type Instant, type Milliseconds } from '#src/recap/domain/time.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';

export const AUTOCOMPACT_USAGE = 'USAGE: tab-recap autocompact [--all]';
export const LISTED = 20;
const DAY_MS = 24 * 60 * 60_000;

const EMPTY = must(parseText(''));
const DASH = must(parseText('—'));

export type Scope = 'all' | 'latest';

export interface ListingRow {
    readonly cells: readonly Text[];
}

export type ParsedListing = { readonly kind: 'options'; readonly all: Scope } | { readonly kind: 'usage'; readonly why: Text };



export function parseListing(argv: readonly string[]): ParsedListing {
    try {
        const { values, positionals } = parseArgs({ args: [...argv], allowPositionals: true, strict: true, options: { all: { type: 'boolean' } } });
        const scope: Scope = values.all === true ? 'all' : 'latest';
        return positionals.length > 0 ? { kind: 'usage', why: must(parseText(`unexpected ${positionals[0] ?? ''}`)) } : { kind: 'options', all: scope };
    } catch (error) {
        return { kind: 'usage', why: must(parseText(error instanceof Error ? error.message : String(error))) };
    }
}

const HEAD: ListingRow = { cells: ['time', 'tab', 'pane', 'status', 'share', 'verdict', 'gate', 'decider', 'cost'].map((line) => must(parseText(line))) };
const SKIPPED: ListingRow = { cells: ['time', 'tab', 'pane', 'share', 'gate', 'detail'].map((line) => must(parseText(line))) };

function stampOf(ms: Instant | null, zone: Text): Text {
    if (ms === null) {
        return DASH;
    }
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ms).map((part) => [part.type, part.value]));
    return must(parseText(`${parts['month']}-${parts['day']} ${parts['hour']}:${parts['minute']}`));
}

const instantOf = (result: Result<Instant, ParseFailure>): Instant | null => (result.kind === 'ok' ? result.value : null);

function rowOf(found: StoredDecision, zone: Text): ListingRow {
    const verdict = found.askedVerdict !== null && found.askedVerdict !== found.verdict ? `${found.verdict} (asked ${found.askedVerdict})` : found.verdict;
    const cells = [found.tab, found.pane, found.laneStatus ?? '—', `${found.share} %`, verdict, found.gate, found.decider ?? '—', moneyOf(found.costUsd)].map((line) => must(parseText(line)));
    return { cells: [stampOf(instantOf(parseInstant(found.at)), zone), ...cells] };
}

function skippedRow(found: Skip, zone: Text): ListingRow {
    const cells = [found.tab, found.pane, found.share === null ? '—' : `${found.share} %`, found.gate, found.detail ?? '—'].map((line) => must(parseText(line)));
    return { cells: [stampOf(instantOf(parseInstant(found.at)), zone), ...cells] };
}

const everyOf = (ms: Milliseconds): Text => must(parseText(ms % 60_000 === 0 ? `${ms / 60_000} min` : `${Math.round(ms / 1000)} s`));

export function styleLine(policy: AutocompactPolicy, tuning: AutocompactTuning, settings: Messages['autocompactSettings']): Text {
    const { verdict } = tuning;
    return must(parseText([
        `style ${tuning.style}`,
        `warnings at most ${verdict.safe.toFixed(2)}`,
        `closes at least ${verdict.closes.toFixed(2)}`,
        `undecided ${verdict.undecidedFrom.toFixed(2)}–${verdict.undecidedTo.toFixed(2)}`,
        `pass mark ${tuning.coverageAtLeast.toFixed(2)}`,
        `ceiling ${policy.ceiling} %`,
        settings.ceilingOverride(policy.ceilingPolicy === 'overrides-check'),
        settings.coverageBackoff(policy.coverageBackoff.kind === 'off' ? 'off' : everyOf(policy.coverageBackoff.ms)),
        settings.missedFacts(policy.missedFacts),
        `cooldown ${everyOf(milliseconds(policy.cooldownMs))}`,
        `re-check ${tuning.recheckIdleMs === null ? 'never' : everyOf(milliseconds(tuning.recheckIdleMs))}`,
    ].join(' · ')));
}

function table(head: ListingRow, rows: readonly ListingRow[]): readonly Text[] {
    const all = [head, ...rows];
    const widths = head.cells.map((_, at) => Math.max(...all.map((row) => (row.cells[at] ?? EMPTY).length)));
    return all.flatMap((row) => [must(parseText(row.cells.map((cell, at) => cell.padEnd(widths[at] ?? 0)).join('  ').trimEnd()))]);
}

export interface Spend {
    readonly since: number;
    readonly costUsd: number;
}

export function listing(decisions: readonly StoredDecision[], spent: Spend, now: number, zone: string, skips: readonly Skip[] = []): readonly Text[] {
    const inDay = decisions.filter((found) => found.at >= now - DAY_MS).length;
    const dayRecap = must(parseText(`last 24 h: ${inDay} decision${inDay === 1 ? '' : 's'}, ${moneyOf(spent.costUsd)}`));
    const zoneName = must(parseText(zone));
    const header = ['no autocompact decisions yet'].map((line) => must(parseText(line)));
    const decided = decisions.length === 0 ? [...header, dayRecap] : [...table(HEAD, decisions.map((found) => rowOf(found, zoneName))), EMPTY, dayRecap];
    const stopped = skips.length === 0 ? [] : [EMPTY, ...['not decided now'].map((line) => must(parseText(line))), ...table(SKIPPED, skips.map((found) => skippedRow(found, zoneName)))];
    return [...decided, ...stopped];
}
