import type { CheckAnchor, CheckAnchors } from '#src/ports/judge.ts';
import type { RunInputs } from '#src/ports/run-inputs.ts';
import type { Disagreement } from '#src/ports/verdicts.ts';

export const ANCHORS_PER_CHECK = 5;
export const WORST_PER_CHECK = 3;

export interface Disagreed extends Disagreement {
    readonly text: string;
}

export function withText(list: readonly Disagreement[], inputs: Pick<RunInputs, 'itemsOf'>): readonly Disagreed[] {
    const items = new Map<string, ReadonlyMap<string, string>>();
    const textOf = (run: string, key: string): string => {
        const known = items.get(run) ?? new Map(inputs.itemsOf(run, 'added').map((item) => [item.key, item.text]));
        items.set(run, known);
        return known.get(key) ?? key;
    };
    return list.map((one) => ({ ...one, text: textOf(one.run, one.item) }));
}

export function perCheck(list: readonly Disagreed[], limit: number): ReadonlyMap<string, readonly Disagreed[]> {
    const found = new Map<string, Disagreed[]>();
    for (const one of list) {
        const mine = found.get(one.check) ?? [];
        found.set(one.check, mine);
        if (mine.length < limit) {
            mine.push(one);
        }
    }
    return found;
}

const anchorOf = (one: Disagreed): CheckAnchor => ({ item: one.text, pass: one.operator, reason: one.reason ?? '' });

export function anchorsOf(list: readonly Disagreed[]): CheckAnchors {
    return new Map([...perCheck(list, ANCHORS_PER_CHECK)].map(([check, mine]) => [check, mine.map(anchorOf)]));
}
