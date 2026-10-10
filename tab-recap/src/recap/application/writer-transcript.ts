import type { Entry } from '#src/ports/transcripts.ts';
import { clipTurn } from './writer-clip.ts';
import { localTime } from './local-time.ts';
import { element, leaf } from './xml.ts';

const CALLS_SHOWN = 4;
const INDENT = '  ';

export interface Clock {
    readonly now: number;
    readonly zone: string;
}

interface Item {
    readonly markup: string;
    readonly turn: boolean;
    readonly at: number | undefined;
}

function callOf(call: Entry): string {
    const attrs = { kind: call.kind ?? 'other', what: call.what };
    return call.text === '' ? element('call', attrs) : leaf('call', attrs, call.text);
}

function burst(tools: readonly Entry[]): Item | null {
    const calls = tools.filter((entry) => entry.kind !== 'read');
    const reads = tools.length - calls.length;
    if (tools.length === 0) {
        return null;
    }
    const shown = calls.slice(-CALLS_SHOWN);
    const attrs = { reads: reads === 0 ? null : reads, more: calls.length > shown.length ? calls.length - shown.length : null };
    return { markup: element('tools', attrs, shown.map(callOf).join('')), turn: false, at: undefined };
}

function turn(entry: Entry, clock: Clock): Item {
    const role = entry.role === 'user' ? 'user' : 'agent';
    const kept = clipTurn(role, entry.text);
    const attrs = { role, at: entry.at === undefined ? null : localTime(entry.at, clock.now, clock.zone), queued: entry.queued === true ? 'yes' : null, clipped: kept.clipped ? 'middle' : null };
    return { markup: leaf('turn', attrs, kept.text), turn: true, at: entry.at };
}

export function itemsOf(entries: readonly Entry[], clock: Clock): readonly Item[] {
    const items: Item[] = [];
    let tools: Entry[] = [];
    for (const entry of entries) {
        if (entry.role === 'tool') {
            tools.push(entry);
            continue;
        }
        const closed = burst(tools);
        tools = [];
        items.push(...(closed === null ? [] : [closed]), turn(entry, clock));
    }
    const last = burst(tools);
    return last === null ? items : [...items, last];
}

function firstThatFits(items: readonly Item[], budget: number): number {
    let used = 0;
    let from = items.length;
    while (from > 0 && used + (items[from - 1]?.markup.length ?? 0) <= budget) {
        used += items[from - 1]?.markup.length ?? 0;
        from -= 1;
    }
    return from;
}

export function turnsOf(entries: readonly Entry[], clock: Clock, budget: number): { readonly attrs: Readonly<Record<string, string | number | null>>; readonly body: string } {
    const items = itemsOf(entries, clock);
    const from = firstThatFits(items, budget);
    const shown = items.slice(from);
    const omitted = items.slice(0, from).filter((item) => item.turn).length;
    const first = shown.find((item) => item.at !== undefined)?.at;
    const attrs = { since: first === undefined || shown[0]?.at === first ? null : localTime(first, clock.now, clock.zone), omitted: omitted === 0 ? null : omitted };
    return { attrs, body: shown.map((item) => `\n${INDENT}${item.markup}`).join('') + (shown.length > 0 ? '\n' : '') };
}

export function transcriptOf(agent: string, entries: readonly Entry[], clock: Clock, budget: number): string {
    const { attrs, body } = turnsOf(entries, clock, budget);
    return element('transcript', { agent, ...attrs }, body);
}
