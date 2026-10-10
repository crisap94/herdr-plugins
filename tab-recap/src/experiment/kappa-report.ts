import { kappa } from './stats.ts';

export const KAPPA_USABLE = 0.6;

export interface Labelled { readonly id: string; readonly labels: Readonly<Record<string, 0 | 1>> }

export interface KappaRow { readonly question: string; readonly n: number; readonly kappa: number; readonly usable: boolean }

export function kappaRows(operator: readonly Labelled[], labeller: readonly Labelled[], questions: readonly string[], minimum = 10): readonly KappaRow[] {
    const theirs = new Map(labeller.map((item) => [item.id, item.labels]));
    return questions.map((question) => {
        const pairs = operator.flatMap((item) => {
            const [mine, other] = [item.labels[question], theirs.get(item.id)?.[question]];
            return mine === undefined || other === undefined ? [] : [[mine, other] as const];
        });
        const value = kappa(pairs.map((pair) => pair[0]), pairs.map((pair) => pair[1]));
        return { question, n: pairs.length, kappa: value, usable: pairs.length >= minimum && value >= KAPPA_USABLE };
    });
}
