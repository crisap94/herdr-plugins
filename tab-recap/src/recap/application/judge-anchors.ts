import type { AnchorCheck, AnchorChecks } from '#src/ports/judge.ts';
import type { RunInputReader } from '#src/ports/run-inputs.ts';
import type { DisagreementRecord } from '#src/ports/verdicts.ts';
import { must } from '@stateforge-labs/session-ledger';
import type { RunId } from '#src/recap/domain/run-ids.ts';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import { textOf, type Text } from '@stateforge-labs/session-ledger';

export const ANCHORS_PER_CHECK: Count = must(parseCount(5));
export const WORST_PER_CHECK: Count = must(parseCount(3));

export interface Disagreed extends DisagreementRecord {
    readonly text: Text;
}

export function withText(list: readonly DisagreementRecord[], inputs: Pick<RunInputReader, 'itemsOf'>): readonly Disagreed[] {
    const items = new Map<RunId, ReadonlyMap<Text, Text>>();
    const itemTextOf = (run: RunId, key: Text): Text => {
        const known = items.get(run) ?? new Map(inputs.itemsOf(run, 'added').map((item): [Text, Text] => [item.key, item.text]));
        items.set(run, known);
        return known.get(key) ?? key;
    };
    return list.map((one) => ({ ...one, text: itemTextOf(one.run, one.item) }));
}

export function perCheck(list: readonly Disagreed[], limit: Count): ReadonlyMap<Text, readonly Disagreed[]> {
    const found = new Map<Text, Disagreed[]>();
    for (const one of list) {
        const check = one.check;
        const mine = found.get(check) ?? [];
        found.set(check, mine);
        if (mine.length < limit) {
            mine.push(one);
        }
    }
    return found;
}

const anchorOf = (one: Disagreed): AnchorCheck => ({ item: one.text, verdict: one.operator === 'pass' ? 'pass' : 'fail', reason: one.reason ?? textOf('') });

export function anchorsOf(list: readonly Disagreed[]): AnchorChecks {
    return new Map([...perCheck(list, ANCHORS_PER_CHECK)].map(([check, mine]) => [check, mine.map(anchorOf)]));
}
