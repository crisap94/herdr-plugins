import type { CheckAnchor } from '#src/ports/judge.ts';
import type { RunInputs } from '#src/ports/run-inputs.ts';
import type { Disagreement } from '#src/ports/verdicts.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

export const ANCHORS_PER_CHECK: Count = must(parseCount(5));
export const WORST_PER_CHECK: Count = must(parseCount(3));

export interface Disagreed extends Disagreement {
    readonly text: Text;
}

export function withText(list: readonly Disagreement[], inputs: Pick<RunInputs, 'itemsOf'>): readonly Disagreed[] {
    const items = new Map<Text, ReadonlyMap<Text, Text>>();
    const textOf = (run: Text, key: Text): Text => {
        const known = items.get(run) ?? new Map(inputs.itemsOf(run, 'added').map((item): [Text, Text] => [must(parseText(item.key)), must(parseText(item.text))]));
        items.set(run, known);
        return known.get(key) ?? key;
    };
    return list.map((one) => ({ ...one, text: textOf(must(parseText(one.run)), must(parseText(one.item))) }));
}

export function perCheck(list: readonly Disagreed[], limit: Count): ReadonlyMap<Text, readonly Disagreed[]> {
    const found = new Map<Text, Disagreed[]>();
    for (const one of list) {
        const check = must(parseText(one.check));
        const mine = found.get(check) ?? [];
        found.set(check, mine);
        if (mine.length < limit) {
            mine.push(one);
        }
    }
    return found;
}

const anchorOf = (one: Disagreed): CheckAnchor => ({ item: one.text, pass: one.operator, reason: one.reason ?? '' });

export function anchorsOf(list: readonly Disagreed[]): ReadonlyMap<Text, readonly CheckAnchor[]> {
    return new Map([...perCheck(list, ANCHORS_PER_CHECK)].map(([check, mine]) => [check, mine.map(anchorOf)]));
}
