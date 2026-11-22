import type { Noul } from '#src/ports/decider.ts';
import { must } from '#src/protocol/result.ts';
import type { FactIndex } from '#src/recap/domain/fact-index.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { Flag, Label } from './stats.ts';


const listed = (questions: ReadonlyMap<Text, Noul>): readonly Text[] =>
    [...questions].map(([id, noul]) => must(parseText(`- ${id}: ${noul.instructions}\n  1 when: ${noul.criteria.true}\n  0 when: ${noul.criteria.false}`)));

export function labelInstructions(questions: ReadonlyMap<Text, Noul>): Text {
    return must(parseText([
        'You label moments of a coding agent\'s work. The input is a JSON document with `state` (what a decider saw when the agent went idle) and `hindsight`',
        '(the operator\'s next prompt, `next_prompt`, and the first entries that followed, `following`; tool entries have an empty or short `text`).',
        'For each question below decide the TRUE answer: 1 or 0. Use the hindsight to settle what the state alone leaves open.',
        'If the hindsight is empty, answer from the state alone.', '', ...listed(questions), '',
        'Reply with exactly one JSON object whose keys are the question ids and whose values are 0 or 1. No other text.',
    ].join('\n')));
}

export function coverageLabelInstructions(): Text {
    return must(parseText([
        'The input is a JSON document with a `brief` (text written to carry a coding session across a compaction) and `facts`, a list of {n, section, text, why}.',
        'For each fact decide: `keeps` = 1 when the brief carries the fact with the detail needed to act on it (names, paths and numbers kept), else 0;',
        'and, only for a fact whose `why` is not null, `reason` = 1 when the brief gives that reason, else 0.',
        'Reply with exactly one JSON object whose keys are the fact numbers (as strings) and whose values are {"keeps": 0|1} or {"keeps": 0|1, "reason": 0|1}. No other text.',
    ].join('\n')));
}

export type ReplyLabel = Label;

export const isReplyLabel = (value: unknown): value is ReplyLabel => value === 0 || value === 1;

export interface CoverageLabel { readonly keeps: Label; readonly reason?: Label }

export interface CoverageAsk { readonly n: FactIndex; readonly reason: Flag }

export interface ReplyObject {
    readonly labels: ReadonlyMap<Text, Label>;
    readonly coverage: ReadonlyMap<Text, CoverageLabel>;
}

export function parseCoverageLabel(value: unknown): CoverageLabel | null {
    if (typeof value !== 'object' || value === null) return null;
    const keeps = 'keeps' in value ? value.keeps : undefined;
    const reason = 'reason' in value ? value.reason : undefined;
    if (!isReplyLabel(keeps)) return null;
    return isReplyLabel(reason) ? { keeps, reason } : { keeps };
}

export function parseReplyObject(raw: unknown): ReplyObject | null {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const entries: readonly (readonly [string, unknown])[] = Object.entries(raw);
    const labels = new Map<Text, Label>();
    const coverage = new Map<Text, CoverageLabel>();
    for (const [key, value] of entries) {
        const id = must(parseText(key));
        if (isReplyLabel(value)) labels.set(id, value);
        const entry = parseCoverageLabel(value);
        if (entry !== null) coverage.set(id, entry);
    }
    return { labels, coverage };
}

function jsonOf(reply: Text): ReplyObject | null {
    const body = reply.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    try {
        const parsed: unknown = JSON.parse(body);
        return parseReplyObject(parsed);
    } catch {
        return null;
    }
}

export function labelsIn(reply: Text, ids: readonly Text[]): ReadonlyMap<Text, Label> | null {
    const parsed = jsonOf(reply);
    if (parsed === null) return null;
    const found = new Map<Text, Label>();
    for (const id of ids) {
        const value = parsed.labels.get(id);
        if (value === undefined) return null;
        found.set(id, value);
    }
    return found;
}

export function coverageLabelsIn(reply: Text, facts: readonly CoverageAsk[]): ReadonlyMap<FactIndex, CoverageLabel> | null {
    const parsed = jsonOf(reply);
    if (parsed === null) return null;
    const found = new Map<FactIndex, CoverageLabel>();
    for (const fact of facts) {
        const entry = parsed.coverage.get(must(parseText(String(fact.n))));
        if (entry === undefined || (fact.reason === 'yes' && entry.reason === undefined)) return null;
        found.set(fact.n, fact.reason === 'yes' ? entry : { keeps: entry.keeps });
    }
    return found;
}
