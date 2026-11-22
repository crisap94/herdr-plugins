import { unfencedText } from '../../tab-recap/src/adapters/job/prompts/recap-prompt.ts';
import { judge } from '../../packages/session-ledger/src/recap/application/ops-gating.ts';
import { LEDGER_GATES } from '../../packages/session-ledger/src/recap/domain/gates/ledger-gates.ts';
import type { Operation } from '../../packages/session-ledger/src/recap/domain/ops.ts';
import { quotedIn } from '../../packages/session-ledger/src/recap/domain/quote.ts';
import { reconciliationOf, type Reconciled } from '../../packages/session-ledger/src/recap/domain/reconciliation.ts';
import type { Answer, Graded, Mark } from '../lib/types.ts';
import { builtOf, groundOf, type ReconcileItem } from './prompt.ts';
import { instant } from '../../packages/session-ledger/src/recap/domain/time.ts';
import { textOf as asText } from '../../packages/session-ledger/src/recap/domain/text.ts';
import { factIdOf } from '../lib/brands.ts';
import { countOf } from '../../packages/session-ledger/src/recap/domain/count.ts';

export const CODE_CRITERIA: readonly string[] = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'];

type Fields = Readonly<Record<string, unknown>>;

const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');

export interface Kept {
    readonly op: Reconciled;
    readonly evidence: string;
    readonly into: string;
}

export interface Checked {
    readonly kept: readonly Kept[];
    readonly parserRefused: readonly string[];
    readonly gateRefused: readonly string[];
    readonly gateFlagged: readonly string[];
}

export function entriesOf(text: string): readonly unknown[] | null {
    try {
        const parsed: unknown = JSON.parse(unfencedText(asText(text)));
        return isFields(parsed) && Array.isArray(parsed['ops']) ? (parsed['ops'] as unknown[]) : null;
    } catch {
        return null;
    }
}

const operationOf = (one: Reconciled): Operation => (one.op === 'close' ? { op: 'close', id: factIdOf(one.id), why: one.why } : { op: 'update', id: factIdOf(one.id), text: one.text, why: one.why });

export function checkedOf(item: ReconcileItem, text: string): Checked | null {
    const entries = entriesOf(text);
    if (entries === null) return null;
    const built = builtOf(item);
    const answer = unfencedText(asText(text));
    const checked = reconciliationOf(asText(answer), built.facts, asText(built.tail));
    const accepted: Fields[] = [];
    for (let size = 1; size <= entries.length && accepted.length < checked.ops.length; size += 1) {
        const prefix = reconciliationOf(asText(JSON.stringify({ ops: entries.slice(0, size) })), built.facts, asText(built.tail));
        if (prefix.ops.length > accepted.length) accepted.push(entries[size - 1] as Fields);
    }
    const ops = checked.ops.map(operationOf);
    const gated = judge(LEDGER_GATES, ops, groundOf(item), instant(item.input.clock.now));
    const refusals = gated.refused.filter((finding) => finding.outcome === 'refuse');
    const out = new Set(refusals.map((finding) => finding.at));
    const kept = checked.ops.flatMap((op, at) => (out.has(countOf(at)) ? [] : [{ op, evidence: textOf(accepted[at]?.['evidence']), into: textOf(accepted[at]?.['into']) }]));
    return {
        kept,
        parserRefused: checked.refused,
        gateRefused: refusals.map((finding) => finding.gate),
        gateFlagged: gated.gated.flagged.map((finding) => finding.gate),
    };
}

export function applies(item: ReconcileItem): Record<string, boolean> {
    const expected = item.expected;
    return { R1: true, R2: true, R3: true, R4: expected.summary_spans.length > 0, R5: true, R6: expected.must_close.length > 0, R7: expected.must_update.length > 0, R8: expected.duplicates.length > 0 };
}

const isMerge = (kept: Kept): boolean => kept.op.op === 'close' && kept.op.why === 'merged';

const hasEvidence = (kept: Kept): boolean => !isMerge(kept);

export function fromSummary(item: ReconcileItem, kept: readonly Kept[]): readonly Kept[] {
    const spans = item.expected.summary_spans;
    if (spans.length === 0) return [];
    const real = spans.reduce((body, span) => body.replace(span, ''), builtOf(item).tail);
    return kept.filter((one) => hasEvidence(one) && spans.some((span) => quotedIn(asText(one.evidence), asText(span))) && !quotedIn(asText(one.evidence), asText(real)));
}

const twinOf = (item: ReconcileItem, id: string): string | null => {
    const pair = item.expected.duplicates.find((each) => each.includes(id));
    return pair === undefined ? null : (pair.find((each) => each !== id) ?? null);
};

export function wrongCloses(item: ReconcileItem, kept: readonly Kept[]): readonly Kept[] {
    const expected = item.expected;
    const updates = expected.must_update.map((one) => one.id);
    return kept.filter((one) => {
        if (one.op.op !== 'close' || updates.includes(one.op.id)) return false;
        if (expected.must_stay_open.includes(one.op.id)) return true;
        const twin = twinOf(item, one.op.id);
        if (twin !== null) return !(isMerge(one) && one.into === twin);
        return isMerge(one);
    });
}

const settles = (kept: readonly Kept[], id: string): boolean => kept.some((one) => one.op.id === id && (one.op.op === 'update' || one.op.why !== 'merged'));

const updated = (kept: readonly Kept[], id: string): boolean => kept.some((one) => one.op.id === id && one.op.op === 'update');

const merged = (kept: readonly Kept[], pair: readonly string[]): boolean => kept.some((one) => isMerge(one) && pair.includes(one.op.id) && pair.includes(one.into) && one.into !== one.op.id);

export function grade(item: ReconcileItem, text: string): Graded {
    const on = applies(item);
    const marks: Record<string, Mark> = {};
    const found = checkedOf(item, text);
    if (found === null) {
        for (const criterion of CODE_CRITERIA) marks[criterion] = on[criterion] === true ? false : null;
        return { parsed: false, marks };
    }
    const kept = found.kept;
    const expected = item.expected;
    const passes: Record<string, boolean> = {
        R1: true,
        R2: found.parserRefused.length === 0,
        R3: found.gateRefused.length === 0,
        R4: fromSummary(item, kept).length === 0,
        R5: wrongCloses(item, kept).length === 0,
        R6: expected.must_close.every((one) => settles(kept, one.id)),
        R7: expected.must_update.every((one) => updated(kept, one.id)),
        R8: expected.duplicates.every((pair) => merged(kept, pair)),
    };
    for (const criterion of CODE_CRITERIA) marks[criterion] = on[criterion] === true ? (passes[criterion] ?? false) : null;
    return { parsed: true, marks };
}

export function stubAnswer(item: ReconcileItem): string {
    const expected = item.expected;
    const ops = [
        ...expected.must_close.map((one) => ({ op: 'close', id: one.id, why: one.why[0], evidence: one.evidence })),
        ...expected.must_update.map((one) => ({ op: 'update', id: one.id, text: one.text, why: null, evidence: one.evidence })),
        ...expected.duplicates.map((pair) => ({ op: 'close', id: pair[1], why: 'merged', into: pair[0] })),
    ];
    return JSON.stringify({ ops });
}

const line = (item: ReconcileItem, id: string): string => {
    const fact = builtOf(item).facts.get(asText(id));
    return fact === undefined ? `${id} [unknown]` : `${id} [${fact.section}] ${fact.text}`;
};

export function opLine(one: Kept): string {
    return one.op.op === 'close'
        ? `${one.op.id} close, reason ${one.op.why}, evidence: "${one.evidence}"`
        : `${one.op.id} update, new text: "${one.op.text}", evidence: "${one.evidence}"`;
}

export const NO_OPERATION = 'No operation was kept.';

export function judgeView(item: ReconcileItem, text: string): { readonly case: string; readonly answer: string } {
    const shown = (checkedOf(item, text)?.kept ?? []).filter(hasEvidence);
    const touched = [...new Set(shown.map((one) => one.op.id))];
    const facts = touched.length === 0 ? ['(no fact is touched)'] : touched.map((id) => line(item, id));
    return {
        case: ['Facts touched by the answer:', ...facts, '', 'Newest turns of the work:', builtOf(item).tail].join('\n'),
        answer: shown.length === 0 ? NO_OPERATION : shown.map(opLine).join('\n'),
    };
}

export type RefusalClass = 'evidence not in the tail' | 'add' | 'id not open' | 'bad reason' | 'answered on a fact that is not needs' | 'bad merge' | 'other';

export function refusalClass(reason: string): RefusalClass {
    if (reason.includes('its evidence is not in the newest turns')) return 'evidence not in the tail';
    if (reason.startsWith('add is not allowed')) return 'add';
    if (reason.includes('is not an open fact')) return 'id not open';
    if (reason.includes('needs a reason')) return 'bad reason';
    if (reason.includes('only a "needs" fact is answered')) return 'answered on a fact that is not needs';
    if (reason.includes('as merged needs another open fact')) return 'bad merge';
    return 'other';
}

export interface Breach {
    readonly config: string;
    readonly id: string;
    readonly repetition: number;
    readonly fact: string;
    readonly op: string;
}

export interface ConfigExtras {
    readonly config: string;
    readonly answers: number;
    readonly parsed: number;
    readonly mean_kept_ops: number | null;
    readonly share_no_op: number | null;
    readonly no_op_expected_answers: number;
    readonly no_op_expected_none: number;
    readonly no_op_expected_share_no_op: number | null;
    readonly parser_refusals: Readonly<Record<string, number>>;
    readonly gate_refusals: Readonly<Record<string, number>>;
    readonly gate_flags: Readonly<Record<string, number>>;
}

export interface Extras {
    readonly audit: string;
    readonly configs: readonly ConfigExtras[];
    readonly still_true_closed: readonly Breach[];
    readonly summary_evidence: readonly Breach[];
    readonly stale_missed: readonly { readonly config: string; readonly id: string; readonly repetition: number; readonly facts: readonly string[] }[];
}

const bump = (counts: Record<string, number>, key: string): void => {
    counts[key] = (counts[key] ?? 0) + 1;
};

export function extras(items: readonly ReconcileItem[], answers: readonly Answer[], configs: readonly string[], audit: string): Extras {
    const byId = new Map(items.map((item) => [item.id, item]));
    const stillTrue: Breach[] = [];
    const summary: Breach[] = [];
    const missed: { config: string; id: string; repetition: number; facts: string[] }[] = [];
    const rows: ConfigExtras[] = configs.map((config) => {
        const mine = answers.filter((answer) => answer.config === config && answer.text !== null && byId.has(answer.id));
        let parsed = 0;
        let keptTotal = 0;
        let none = 0;
        let noOpAnswers = 0;
        let noOpNone = 0;
        const parser: Record<string, number> = {};
        const gates: Record<string, number> = {};
        const flags: Record<string, number> = {};
        for (const answer of mine) {
            const item = byId.get(answer.id) as ReconcileItem;
            const found = checkedOf(item, answer.text ?? '');
            if (found === null) continue;
            parsed += 1;
            keptTotal += found.kept.length;
            if (found.kept.length === 0) none += 1;
            if (item.tags.includes('no-op-expected')) {
                noOpAnswers += 1;
                if (found.kept.length === 0) noOpNone += 1;
            }
            for (const reason of found.parserRefused) bump(parser, refusalClass(reason));
            for (const gate of found.gateRefused) bump(gates, gate);
            for (const gate of found.gateFlagged) bump(flags, gate);
            const where = { config, id: answer.id, repetition: answer.repetition };
            for (const one of wrongCloses(item, found.kept)) stillTrue.push({ ...where, fact: line(item, one.op.id), op: isMerge(one) ? `${one.op.id} close, reason merged, into ${one.into}` : opLine(one) });
            for (const one of fromSummary(item, found.kept)) summary.push({ ...where, fact: line(item, one.op.id), op: opLine(one) });
            const left = item.expected.must_close.filter((one) => !settles(found.kept, one.id)).map((one) => line(item, one.id));
            if (left.length > 0) missed.push({ ...where, facts: left });
        }
        return {
            config,
            answers: mine.length,
            parsed,
            mean_kept_ops: parsed === 0 ? null : keptTotal / parsed,
            share_no_op: parsed === 0 ? null : none / parsed,
            no_op_expected_answers: noOpAnswers,
            no_op_expected_none: noOpNone,
            no_op_expected_share_no_op: noOpAnswers === 0 ? null : noOpNone / noOpAnswers,
            parser_refusals: parser,
            gate_refusals: gates,
            gate_flags: flags,
        };
    });
    const order = (a: { config: string; id: string; repetition: number }, b: { config: string; id: string; repetition: number }): number => a.config.localeCompare(b.config) || a.id.localeCompare(b.id) || a.repetition - b.repetition;
    return { audit, configs: rows, still_true_closed: stillTrue.sort(order), summary_evidence: summary.sort(order), stale_missed: missed.sort(order) };
}

const num = (value: number | null): string => (value === null ? '-' : value.toFixed(2));

const counted = (counts: Readonly<Record<string, number>>): string => {
    const entries = Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
    return entries.length === 0 ? '0' : entries.map(([key, count]) => `${key} ${count}`).join(', ');
};

export function extrasMarkdown(found: Extras): string {
    const lines: string[] = ['', '## curator-reconcile: reported only (no pass mark)', '', `- ${found.audit}`, '- RJ1 is judge, not validated, until the judge-agreement eval validates it. On claude-sonnet-medium and claude-sonnet-high the judge grades its own model.', '- The judge is not told which turns are summaries: a quote from a summary can pass RJ1 and fail R4.', ''];
    lines.push('### R5: still-true facts closed (the costly error), per item and per close', '');
    if (found.still_true_closed.length === 0) lines.push('None.');
    for (const each of found.still_true_closed) lines.push(`- ${each.config} ${each.id} rep ${each.repetition}: ${each.fact} <- ${each.op}`);
    lines.push('', '### R4: kept operations whose evidence is only in a summary', '');
    if (found.summary_evidence.length === 0) lines.push('None.');
    for (const each of found.summary_evidence) lines.push(`- ${each.config} ${each.id} rep ${each.repetition}: ${each.fact} <- ${each.op}`);
    lines.push('', '### R6: stale facts left open (the cheap error)', '');
    if (found.stale_missed.length === 0) lines.push('None.');
    for (const each of found.stale_missed) lines.push(`- ${each.config} ${each.id} rep ${each.repetition}: ${each.facts.join('; ')}`);
    lines.push('', '### Kept operations, refusals and flags per configuration', '');
    lines.push('Read RJ1 next to the share of answers with no kept operation: such an answer passes RJ1 without telling anything. On the 11 no-op-expected items the right answer has no operation.', '');
    lines.push('| Configuration | Parsed / answers | Mean kept ops | Share with no kept op | No kept op on no-op-expected items | Parser refusals | Gate refusals | Gate flags |', '|---|---|---|---|---|---|---|---|');
    for (const row of found.configs) lines.push(`| ${row.config} | ${row.parsed} of ${row.answers} | ${num(row.mean_kept_ops)} | ${num(row.share_no_op)} | ${row.no_op_expected_none} of ${row.no_op_expected_answers} | ${counted(row.parser_refusals)} | ${counted(row.gate_refusals)} | ${counted(row.gate_flags)} |`);
    lines.push('');
    return lines.join('\n');
}
