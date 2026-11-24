import { parseArgs } from 'node:util';
import type { SkipRow, StoredDecisionRow } from '@stateforge-labs/session-ledger';
import type { Policy } from '@stateforge-labs/session-ledger';
import type { CompactTuning } from '@stateforge-labs/session-ledger';
import { moneyOf } from '@stateforge-labs/session-ledger';
import type { Messages } from '#src/i18n/index.ts';
import { must, type Result } from '@stateforge-labs/session-ledger';
import { parseInstant, parseMilliseconds, type Instant, type Milliseconds } from '@stateforge-labs/session-ledger';
import type { Usd } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import type { ParseFailure } from '@stateforge-labs/session-ledger';

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



export function parseListingArgs(argv: readonly Text[]): ParsedListing {
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

function rowOf(found: StoredDecisionRow, zone: Text): ListingRow {
    const verdict = found.askedVerdict !== null && found.askedVerdict !== found.verdict ? `${found.verdict} (asked ${found.askedVerdict})` : found.verdict;
    const cells = [found.scope, found.key, found.laneStatus ?? '—', `${found.share} %`, verdict, found.gate, found.decider ?? '—', moneyOf(found.costUsd)].map((line) => must(parseText(line)));
    return { cells: [stampOf(instantOf(parseInstant(found.at)), zone), ...cells] };
}

function skippedRow(found: SkipRow, zone: Text): ListingRow {
    const cells = [found.scope, found.key, found.share === null ? '—' : `${found.share} %`, found.gate, found.detail ?? '—'].map((line) => must(parseText(line)));
    return { cells: [stampOf(instantOf(parseInstant(found.at)), zone), ...cells] };
}

const everyOf = (ms: Milliseconds): Text => must(parseText(ms % 60_000 === 0 ? `${ms / 60_000} min` : `${Math.round(ms / 1000)} s`));

export function styleLine(policy: Policy, tuning: CompactTuning, settings: Messages['autocompactSettings']): Text {
    const { verdict } = tuning;
    return must(parseText([
        `style ${tuning.style}`,
        `warnings at most ${verdict.safe.toFixed(2)}`,
        `closes at least ${verdict.closes.toFixed(2)}`,
        `undecided ${verdict.undecidedFrom.toFixed(2)}–${verdict.undecidedTo.toFixed(2)}`,
        `pass mark ${tuning.coverageAtLeast.toFixed(2)}`,
        `ceiling ${policy.ceiling} %`,
        settings.ceilingOverride(policy.ceilingPolicy === 'overrides-check' ? 'present' : 'absent'),
        settings.coverageBackoff(policy.coverageBackoff.kind === 'off' ? must(parseText('off')) : everyOf(policy.coverageBackoff.ms)),
        settings.missedFacts(policy.missedFacts),
        `cooldown ${everyOf(policy.cooldownMs)}`,
        `re-check ${tuning.recheckIdleMs === null ? 'never' : everyOf(must(parseMilliseconds(tuning.recheckIdleMs)))}`,
    ].join(' · ')));
}

function table(head: ListingRow, rows: readonly ListingRow[]): readonly Text[] {
    const all = [head, ...rows];
    const widths = head.cells.map((_, at) => Math.max(...all.map((row) => (row.cells[at] ?? EMPTY).length)));
    return all.flatMap((row) => [must(parseText(row.cells.map((cell, at) => cell.padEnd(widths[at] ?? 0)).join('  ').trimEnd()))]);
}

export interface Spend {
    readonly since: Instant;
    readonly costUsd: Usd;
}

export function listingOf(decisions: readonly StoredDecisionRow[], spent: Spend, now: Instant, zone: Text, skips: readonly SkipRow[] = []): readonly Text[] {
    const inDay = decisions.filter((found) => found.at >= now - DAY_MS).length;
    const dayRecap = must(parseText(`last 24 h: ${inDay} decision${inDay === 1 ? '' : 's'}, ${moneyOf(spent.costUsd)}`));
    const header = ['no autocompact decisions yet'].map((line) => must(parseText(line)));
    const decided = decisions.length === 0 ? [...header, dayRecap] : [...table(HEAD, decisions.map((found) => rowOf(found, zone))), EMPTY, dayRecap];
    const stopped = skips.length === 0 ? [] : [EMPTY, ...['not decided now'].map((line) => must(parseText(line))), ...table(SKIPPED, skips.map((found) => skippedRow(found, zone)))];
    return [...decided, ...stopped];
}
