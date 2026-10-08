// The operator's corrections of the judge, put to use: as anchors in the judge's instructions (at most five per check, newest first) and as the
// items `--agree` points at (the three newest per check). The item's text is looked up in the run it came from. Pure.
import type { CheckAnchor, CheckAnchors } from '#src/ports/judge.ts';
import type { RunInputs } from '#src/ports/run-inputs.ts';
import type { Disagreement } from '#src/ports/verdicts.ts';

/** The most corrections the judge's instructions carry for one check. */
export const ANCHORS_PER_CHECK = 5;
/** The most disagreeing items `--agree` lists for one check. */
export const WORST_PER_CHECK = 3;

/** A disagreement with the text of the item it is about (the key when the run no longer holds it). */
export interface Disagreed extends Disagreement {
    readonly text: string;
}

/** `list` with each item's text; the runs' items are read once each. */
export function withText(list: readonly Disagreement[], inputs: Pick<RunInputs, 'itemsOf'>): readonly Disagreed[] {
    const items = new Map<string, ReadonlyMap<string, string>>();
    const textOf = (run: string, key: string): string => {
        const known = items.get(run) ?? new Map(inputs.itemsOf(run, 'added').map((item) => [item.key, item.text]));
        items.set(run, known);
        return known.get(key) ?? key;
    };
    return list.map((one) => ({ ...one, text: textOf(one.run, one.item) }));
}

/** The first `limit` of each check, in the order given (newest first). */
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

/** What the judge is told for each check: where the operator ruled against it, newest first. */
export function anchorsOf(list: readonly Disagreed[]): CheckAnchors {
    return new Map([...perCheck(list, ANCHORS_PER_CHECK)].map(([check, mine]) => [check, mine.map(anchorOf)]));
}
