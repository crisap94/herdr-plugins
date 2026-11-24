import { must } from '@stateforge-labs/session-ledger';
import type { Count } from '@stateforge-labs/session-ledger';
import type { ClosedWhy, Section } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import { instant, type Instant } from '@stateforge-labs/session-ledger';

export type Standing = 'good' | 'failed';

export interface ImportedItem {
    readonly section: Section;
    readonly position: Count;
    readonly text: Text;
}

export interface ImportedRun {
    readonly run: Uint8Array;
    readonly at: Instant;
    readonly language: Text;
    readonly good: Standing;
    readonly items: readonly ImportedItem[];
}

export interface FactClosure {
    readonly why: ClosedWhy;
    readonly at: Instant;
}

export interface ImportedFact {
    readonly section: Section;
    readonly text: Text;
    readonly why: Text | null;
    readonly firstAt: Instant;
    readonly lastAt: Instant;
    readonly bornRun: Uint8Array;
    readonly lastRun: Uint8Array;
    readonly closed: FactClosure | null;
    readonly language: Text;
}

export const NOT_RECORDED: Text = must(parseText('(not recorded)'));

const REASON = /\b(because|so that|since|instead of|rather than|to|porque|para|ya que|en lugar de)\b[^]*$/iu;

export const normalised = (text: Text): Text => must(parseText(text.toLowerCase().replaceAll(/[^\p{L}\p{N}\s]/gu, '').replaceAll(/\s+/g, ' ').trim()));

export function whyOf(text: Text): Text {
    const split = /[:—]/u.exec(text);
    const after = split === null ? '' : text.slice(split.index + 1).trim();
    const reason = after !== '' ? after : (REASON.exec(text)?.[0] ?? null);
    return reason === null ? NOT_RECORDED : must(parseText(reason));
}

interface Live {
    section: Section;
    text: Text;
    firstAt: Instant;
    lastAt: Instant;
    bornRun: Uint8Array;
    lastRun: Uint8Array;
    language: Text;
    lastIndex: number;
}

interface KeyedItem {
    readonly item: ImportedItem;
    readonly key: Text;
}

type Order = -1 | 0 | 1;

function byPosition(a: ImportedItem, b: ImportedItem): Order {
    if (a.position < b.position) {
        return -1;
    }
    return a.position > b.position ? 1 : 0;
}

function keysOf(items: readonly ImportedItem[]): readonly KeyedItem[] {
    const seen = new Map<string, number>();
    return items.toSorted(byPosition).map((item) => {
        const base = `${item.section}\u0000${normalised(item.text)}`;
        const nth = seen.get(base) ?? 0;
        seen.set(base, nth + 1);
        return { item, key: must(parseText(`${base}\u0000${nth}`)) };
    });
}

export function itemsToFacts(runs: readonly ImportedRun[]): readonly ImportedFact[] {
    const seen = new Map<Text, Live>();
    runs.forEach((run, index) => {
        for (const { item, key } of keysOf(run.items)) {
            const was = seen.get(key);
            seen.set(key, was === undefined
                ? { section: item.section, text: item.text, firstAt: run.at, lastAt: run.at, bornRun: run.run, lastRun: run.run, language: run.language, lastIndex: index }
                : { ...was, text: item.text, lastAt: run.at, lastRun: run.run, language: run.language, lastIndex: index });
        }
    });
    const lastGood = runs.findLastIndex((run) => run.good === 'good');
    const openItems = lastGood < 0 ? [] : keysOf(runs[lastGood]?.items ?? []);
    const open = new Set(openItems.map((each) => each.key));
    const stamp = lastGood < 0 ? instant(0) : (runs[lastGood]?.at ?? instant(0));
    const closed = [...seen.entries()].filter(([key]) => !open.has(key)).map(([, live]): ImportedFact => {
        const next = runs[live.lastIndex + 1];
        const goal = live.section === 'goal';
        return {
            section: live.section, text: live.text, why: live.section === 'decisions' ? whyOf(live.text) : null, firstAt: live.firstAt, lastAt: live.lastAt, bornRun: live.bornRun, lastRun: live.lastRun, language: live.language,
            closed: { why: goal ? 'superseded' : 'rewritten', at: next?.at ?? live.lastAt },
        };
    });
    const current = openItems.flatMap(({ item, key }) => { const live = seen.get(key); return live === undefined ? [] : [{ ...live, text: item.text }]; }).map((live): ImportedFact => ({
        section: live.section, text: live.text, why: live.section === 'decisions' ? whyOf(live.text) : null, firstAt: live.firstAt, lastAt: stamp, bornRun: live.bornRun, lastRun: runs[lastGood]?.run ?? live.lastRun, language: live.language, closed: null,
    }));
    return [...closed, ...current];
}
