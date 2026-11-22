import type { Count } from '#src/contract/kernel.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { brand, type Brand } from '#src/recap/domain/brand.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { clipTurn } from './writer-clip.ts';
import { localTime } from './local-time.ts';
import { element, leaf } from './xml.ts';

const textOf = brand<string, 'Text'>;
const count = brand<number, 'Count'>;
const isTurn = brand<boolean, 'IsTurn'>;

type IsTurn = Brand<boolean, 'IsTurn'>;

const CALLS_SHOWN = 4;
const INDENT = '  ';

export interface Clock {
    readonly now: Instant;
    readonly zone: Text;
}

interface Item {
    readonly markup: Text;
    readonly turn: IsTurn;
    readonly at: Instant | undefined;
}

function callOf(call: Entry): Text {
    const attrs = { kind: call.kind ?? 'other', what: call.what };
    return textOf(call.text === '' ? element('call', attrs) : leaf('call', attrs, call.text));
}

function burst(tools: readonly Entry[]): Item | null {
    const calls = tools.filter((entry) => entry.kind !== 'read');
    const reads = tools.length - calls.length;
    if (tools.length === 0) {
        return null;
    }
    const shown = calls.slice(-CALLS_SHOWN);
    const attrs = { reads: reads === 0 ? null : reads, more: calls.length > shown.length ? calls.length - shown.length : null };
    return { markup: textOf(element('tools', attrs, shown.map(callOf).join(''))), turn: isTurn(false), at: undefined };
}

function turn(entry: Entry, clock: Clock): Item {
    const role = entry.role === 'user' ? 'user' : 'agent';
    const kept = clipTurn(role, textOf(entry.text));
    const attrs = { role, at: entry.at === undefined ? null : localTime(instant(entry.at), clock.now, clock.zone), queued: entry.queued === true ? 'yes' : null, clipped: kept.clipped ? 'middle' : null };
    return { markup: textOf(leaf('turn', attrs, kept.text)), turn: isTurn(true), at: entry.at === undefined ? undefined : instant(entry.at) };
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

function firstThatFits(items: readonly Item[], budget: Count): Count {
    let used = 0;
    let from = items.length;
    while (from > 0 && used + (items[from - 1]?.markup.length ?? 0) <= budget) {
        used += items[from - 1]?.markup.length ?? 0;
        from -= 1;
    }
    return count(from);
}

export type TurnAttrs = { readonly since: Text | null; readonly omitted: Count | null };

export interface Turns {
    readonly attrs: TurnAttrs;
    readonly body: Text;
}

export function turnsOf(entries: readonly Entry[], clock: Clock, budget: Count): Turns {
    const items = itemsOf(entries, clock);
    const from = firstThatFits(items, budget);
    const shown = items.slice(from);
    const omitted = items.slice(0, from).filter((item) => item.turn).length;
    const first = shown.find((item) => item.at !== undefined)?.at;
    const attrs = { since: first === undefined || shown[0]?.at === first ? null : localTime(first, clock.now, clock.zone), omitted: omitted === 0 ? null : count(omitted) };
    return { attrs, body: textOf(shown.map((item) => `\n${INDENT}${item.markup}`).join('') + (shown.length > 0 ? '\n' : '')) };
}

export function transcriptOf(agent: Text, entries: readonly Entry[], clock: Clock, budget: Count): Text {
    const { attrs, body } = turnsOf(entries, clock, budget);
    return textOf(element('transcript', { agent, ...attrs }, body));
}
