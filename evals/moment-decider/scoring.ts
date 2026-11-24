import { probabilitiesOf } from '../../tab-recap/src/adapters/job/decider.ts';
import { verdictOf, type Verdict } from '../../packages/session-ledger/src/recap/domain/autocompact-verdict.ts';
import type { Answer, Graded, Mark } from '../lib/types.ts';
import { QUESTION_IDS, type DeciderItem, type Side } from './prompt.ts';
import { textOf } from '../../packages/session-ledger/src/recap/domain/text.ts';

export const CONFIDENT = { trueBelow: 0.1, falseAbove: 0.9 } as const;

export const QUESTION_CRITERIA: readonly string[] = QUESTION_IDS.map((id) => `Q_${id}`);

export const CODE_CRITERIA: readonly string[] = ['C1', 'C2', 'C2M', 'C3', 'C4', 'C5', 'C6', ...QUESTION_CRITERIA];

const sideOf = (item: DeciderItem, id: string): Side => item.expected.answers[id] ?? 'open';

const scoredIds = (item: DeciderItem): string[] => QUESTION_IDS.filter((id) => sideOf(item, id) !== 'open');

const onSide = (side: Side, value: number): boolean => (side === 'true' ? value > 0.5 : side === 'false' ? value < 0.5 : true);

const confidentWrong = (side: Side, value: number): boolean => (side === 'true' ? value < CONFIDENT.trueBelow : side === 'false' ? value > CONFIDENT.falseAbove : false);

export function applies(item: DeciderItem): Record<string, boolean> {
    const wait = item.expected.verdict === 'wait';
    const on: Record<string, boolean> = { C1: true, C2: wait, C2M: wait && item.plants.includes('mid-work'), C3: !wait, C4: true, C5: true, C6: true };
    for (const id of QUESTION_IDS) on[`Q_${id}`] = sideOf(item, id) !== 'open';
    return on;
}

export function decided(text: string): { readonly p: Record<string, number>; readonly v: Verdict } | null {
    const found = probabilitiesOf(textOf(text), QUESTION_IDS.map((id) => textOf(id)));
    if (found === null) return null;
    const p = Object.fromEntries(found);
    return { p, v: verdictOf(p) };
}

export function grade(item: DeciderItem, text: string): Graded {
    const on = applies(item);
    const marks: Record<string, Mark> = {};
    const found = decided(text);
    if (found === null) {
        for (const criterion of CODE_CRITERIA) marks[criterion] = on[criterion] === true ? false : null;
        return { parsed: false, marks };
    }
    const { p, v } = found;
    const value = (id: string): number => p[id] ?? Number.NaN;
    const scored = scoredIds(item);
    const passes: Record<string, boolean> = {
        C1: true,
        C2: v !== 'compact',
        C2M: v !== 'compact',
        C3: v === 'compact',
        C4: v === item.expected.verdict,
        C5: scored.every((id) => onSide(sideOf(item, id), value(id))),
        C6: scored.every((id) => !confidentWrong(sideOf(item, id), value(id))),
    };
    for (const id of QUESTION_IDS) passes[`Q_${id}`] = onSide(sideOf(item, id), value(id));
    for (const criterion of CODE_CRITERIA) marks[criterion] = on[criterion] === true ? (passes[criterion] ?? false) : null;
    return { parsed: true, marks };
}

export function stubAnswer(item: DeciderItem): string {
    const values: Record<string, number> = {};
    for (const id of QUESTION_IDS) {
        const side = sideOf(item, id);
        values[id] = side === 'true' ? 0.95 : side === 'false' ? 0.05 : 0.5;
    }
    return JSON.stringify(values);
}

export interface Breach {
    readonly config: string;
    readonly id: string;
    readonly repetition: number;
    readonly verdict: Verdict;
    readonly probabilities: Readonly<Record<string, number>>;
}

export interface ConfigExtras {
    readonly config: string;
    readonly parsed: number;
    readonly undecided: number;
    readonly undecided_rate: number | null;
    readonly brier: number | null;
    readonly brier_by_question: Readonly<Record<string, number | null>>;
    readonly stable_items: number;
    readonly items: number;
    readonly unstable: readonly { readonly id: string; readonly verdicts: readonly string[] }[];
}

export interface Extras {
    readonly audit: string;
    readonly configs: readonly ConfigExtras[];
    readonly unsafe_compactions: readonly Breach[];
    readonly missed_safe_moments: readonly Breach[];
}

const mean = (values: readonly number[]): number | null => (values.length === 0 ? null : values.reduce((total, each) => total + each, 0) / values.length);

export function extras(items: readonly DeciderItem[], answers: readonly Answer[], configs: readonly string[], repetitions: number, audit: string): Extras {
    const byId = new Map(items.map((item) => [item.id, item]));
    const unsafe: Breach[] = [];
    const missed: Breach[] = [];
    const rows: ConfigExtras[] = configs.map((config) => {
        const mine = answers.filter((answer) => answer.config === config && byId.has(answer.id));
        let parsed = 0;
        let undecided = 0;
        const errors: Record<string, number[]> = Object.fromEntries(QUESTION_IDS.map((id) => [id, [] as number[]]));
        const verdicts = new Map<string, Map<number, string>>();
        for (const answer of mine) {
            const item = byId.get(answer.id) as DeciderItem;
            const reps = verdicts.get(answer.id) ?? new Map<number, string>();
            verdicts.set(answer.id, reps);
            if (answer.text === null) continue;
            const found = decided(answer.text);
            if (found === null) {
                reps.set(answer.repetition, 'unparsed');
                continue;
            }
            parsed += 1;
            reps.set(answer.repetition, found.v);
            if (found.v === 'undecided') undecided += 1;
            for (const id of scoredIds(item)) errors[id]?.push(((found.p[id] ?? Number.NaN) - (sideOf(item, id) === 'true' ? 1 : 0)) ** 2);
            const breach: Breach = { config, id: answer.id, repetition: answer.repetition, verdict: found.v, probabilities: found.p };
            if (item.expected.verdict === 'wait' && found.v === 'compact') unsafe.push(breach);
            if (item.expected.verdict === 'compact' && found.v !== 'compact') missed.push(breach);
        }
        const unstable: { id: string; verdicts: string[] }[] = [];
        let stable = 0;
        for (const item of items) {
            const reps = verdicts.get(item.id) ?? new Map<number, string>();
            const list = Array.from({ length: repetitions }, (_unused, index) => reps.get(index + 1) ?? 'missing');
            if (list.every((each) => each === list[0]) && list[0] !== 'missing' && list[0] !== 'unparsed') stable += 1;
            else unstable.push({ id: item.id, verdicts: list });
        }
        const brierByQuestion: Record<string, number | null> = Object.fromEntries(QUESTION_IDS.map((id) => [id, mean(errors[id] ?? [])]));
        return {
            config,
            parsed,
            undecided,
            undecided_rate: parsed === 0 ? null : undecided / parsed,
            brier: mean(Object.values(errors).flat()),
            brier_by_question: brierByQuestion,
            stable_items: stable,
            items: items.length,
            unstable,
        };
    });
    const order = (a: Breach, b: Breach): number => a.config.localeCompare(b.config) || a.id.localeCompare(b.id) || a.repetition - b.repetition;
    return { audit, configs: rows, unsafe_compactions: unsafe.sort(order), missed_safe_moments: missed.sort(order) };
}

const num = (value: number | null): string => (value === null ? '-' : value.toFixed(4));

const probs = (p: Readonly<Record<string, number>>): string => QUESTION_IDS.map((id) => `${id}=${num(p[id] ?? null)}`).join(', ');

export function extrasMarkdown(found: Extras): string {
    const lines: string[] = ['', '## moment-decider: reported only (no pass mark)', '', `- ${found.audit}`, '- No judge call is made in this eval: every criterion is graded by code.', ''];
    lines.push('### Compactions at an unsafe moment (the costly error: expected wait, verdict compact)', '');
    if (found.unsafe_compactions.length === 0) lines.push('None.');
    for (const each of found.unsafe_compactions) lines.push(`- ${each.config} ${each.id} rep ${each.repetition}: ${probs(each.probabilities)}`);
    lines.push('', '### Safe moments missed (the cheap error: expected compact, verdict wait or undecided)', '');
    if (found.missed_safe_moments.length === 0) lines.push('None.');
    for (const each of found.missed_safe_moments) lines.push(`- ${each.config} ${each.id} rep ${each.repetition}: ${each.verdict}; ${probs(each.probabilities)}`);
    lines.push('', '### Verdict stability, undecided rate, Brier score', '');
    lines.push(`| Configuration | Stable items | Undecided / parsed | Brier | ${QUESTION_IDS.map((id) => `Brier ${id}`).join(' | ')} |`);
    lines.push(`|---|---|---|---|${QUESTION_IDS.map(() => '---').join('|')}|`);
    for (const row of found.configs) lines.push(`| ${row.config} | ${row.stable_items} of ${row.items} | ${row.undecided} of ${row.parsed} | ${num(row.brier)} | ${QUESTION_IDS.map((id) => num(row.brier_by_question[id] ?? null)).join(' | ')} |`);
    lines.push('', '### Items whose verdict is not the same in every repetition', '');
    const unstable = found.configs.flatMap((row) => row.unstable.map((each) => `- ${row.config} ${each.id}: ${each.verdicts.join(', ')}`));
    lines.push(...(unstable.length === 0 ? ['None.'] : unstable), '');
    return lines.join('\n');
}
