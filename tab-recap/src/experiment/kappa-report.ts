import { must } from '@stateforge-labs/session-ledger';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import type { Kappa } from '#src/recap/domain/kappa.ts';
import type { Text } from '@stateforge-labs/session-ledger';
import { kappaOf, type Label } from './stats.ts';


export const KAPPA_USABLE = 0.6;

const MINIMUM = must(parseCount(10));

export type Usability = 'usable' | 'unusable';

export interface LabelledMoment { readonly id: Text; readonly labels: ReadonlyMap<Text, Label> }

export interface KappaScore { readonly question: Text; readonly n: Count; readonly kappa: Kappa | null; readonly usable: Usability }

export function kappaScores(operator: readonly LabelledMoment[], labeller: readonly LabelledMoment[], questions: readonly Text[], minimum: Count = MINIMUM): readonly KappaScore[] {
    const theirs = new Map(labeller.map((item) => [item.id, item.labels]));
    return questions.map((question) => {
        const pairs = operator.flatMap((item) => {
            const [mine, other] = [item.labels.get(question), theirs.get(item.id)?.get(question)];
            return mine === undefined || other === undefined ? [] : [[mine, other] as const];
        });
        const value = kappaOf(pairs.map((pair) => pair[0]), pairs.map((pair) => pair[1]));
        return { question, n: must(parseCount(pairs.length)), kappa: value, usable: pairs.length >= minimum && value !== null && value >= KAPPA_USABLE ? 'usable' : 'unusable' };
    });
}
