import type { ClosedWhy, Section } from '#src/recap/domain/fact.ts';

export interface ImportedItem {
    readonly section: Section;
    readonly position: number;
    readonly text: string;
}

export interface ImportedRun {
    readonly run: string;
    readonly at: number;
    readonly language: string;
    readonly good: boolean;
    readonly items: readonly ImportedItem[];
}

export interface ImportedFact {
    readonly section: Section;
    readonly text: string;
    readonly why: string | null;
    readonly firstAt: number;
    readonly lastAt: number;
    readonly bornRun: string;
    readonly lastRun: string;
    readonly closed: { readonly why: ClosedWhy; readonly at: number } | null;
    readonly language: string;
}

export const NOT_RECORDED = '(not recorded)';

const REASON = /\b(because|so that|since|instead of|rather than|to|porque|para|ya que|en lugar de)\b[^]*$/iu;

export const normalised = (text: string): string => text.toLowerCase().replaceAll(/[^\p{L}\p{N}\s]/gu, '').replaceAll(/\s+/g, ' ').trim();

export function whyOf(text: string): string {
    const split = /[:—]/u.exec(text);
    const after = split === null ? '' : text.slice(split.index + 1).trim();
    return after !== '' ? after : (REASON.exec(text)?.[0] ?? NOT_RECORDED);
}

interface Live {
    section: Section;
    text: string;
    firstAt: number;
    lastAt: number;
    bornRun: string;
    lastRun: string;
    language: string;
    lastIndex: number;
}

function keysOf(items: readonly ImportedItem[]): readonly { readonly item: ImportedItem; readonly key: string }[] {
    const seen = new Map<string, number>();
    return items.toSorted((a, b) => a.position - b.position).map((item) => {
        const base = `${item.section}\u0000${normalised(item.text)}`;
        const nth = seen.get(base) ?? 0;
        seen.set(base, nth + 1);
        return { item, key: `${base}\u0000${nth}` };
    });
}

function walk(runs: readonly ImportedRun[]): Map<string, Live> {
    const seen = new Map<string, Live>();
    runs.forEach((run, index) => {
        for (const { item, key } of keysOf(run.items)) {
            const was = seen.get(key);
            seen.set(key, was === undefined
                ? { section: item.section, text: item.text, firstAt: run.at, lastAt: run.at, bornRun: run.run, lastRun: run.run, language: run.language, lastIndex: index }
                : { ...was, text: item.text, lastAt: run.at, lastRun: run.run, language: run.language, lastIndex: index });
        }
    });
    return seen;
}

const reasonOf = (live: Live): string | null => (live.section === 'decisions' ? whyOf(live.text) : null);

export function itemsToFacts(runs: readonly ImportedRun[]): readonly ImportedFact[] {
    const seen = walk(runs);
    const lastGood = runs.findLastIndex((run) => run.good);
    const openItems = lastGood < 0 ? [] : keysOf(runs[lastGood]?.items ?? []);
    const open = new Set(openItems.map((each) => each.key));
    const stamp = lastGood < 0 ? 0 : (runs[lastGood]?.at ?? 0);
    const closed = [...seen.entries()].filter(([key]) => !open.has(key)).map(([, live]): ImportedFact => {
        const next = runs[live.lastIndex + 1];
        const goal = live.section === 'goal';
        return {
            section: live.section, text: live.text, why: reasonOf(live), firstAt: live.firstAt, lastAt: live.lastAt, bornRun: live.bornRun, lastRun: live.lastRun, language: live.language,
            closed: { why: goal ? 'superseded' : 'rewritten', at: next?.at ?? live.lastAt },
        };
    });
    const current = openItems.flatMap(({ item, key }) => { const live = seen.get(key); return live === undefined ? [] : [{ ...live, text: item.text }]; }).map((live): ImportedFact => ({
        section: live.section, text: live.text, why: reasonOf(live), firstAt: live.firstAt, lastAt: stamp, bornRun: live.bornRun, lastRun: runs[lastGood]?.run ?? live.lastRun, language: live.language, closed: null,
    }));
    return [...closed, ...current];
}
