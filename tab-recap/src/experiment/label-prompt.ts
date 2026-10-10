import type { Noul } from '#src/ports/decider.ts';

const text = (part: string | object): string => (typeof part === 'string' ? part : JSON.stringify(part));

const listed = (questions: Readonly<Record<string, Noul>>): string[] =>
    Object.entries(questions).map(([id, noul]) => `- ${id}: ${text(noul.instructions)}\n  1 when: ${text(noul.criteria.true)}\n  0 when: ${text(noul.criteria.false)}`);

export function labelInstructions(questions: Readonly<Record<string, Noul>>): string {
    return [
        'You label moments of a coding agent\'s work. The input is a JSON document with `state` (what a decider saw when the agent went idle) and `hindsight`',
        '(the operator\'s next prompt, `next_prompt`, and the first entries that followed, `following`; tool entries have an empty or short `text`).',
        'For each question below decide the TRUE answer: 1 or 0. Use the hindsight to settle what the state alone leaves open.',
        'If the hindsight is empty, answer from the state alone.', '', ...listed(questions), '',
        'Reply with exactly one JSON object whose keys are the question ids and whose values are 0 or 1. No other text.',
    ].join('\n');
}

export function coverageLabelInstructions(): string {
    return [
        'The input is a JSON document with a `brief` (text written to carry a coding session across a compaction) and `facts`, a list of {n, section, text, why}.',
        'For each fact decide: `keeps` = 1 when the brief carries the fact with the detail needed to act on it (names, paths and numbers kept), else 0;',
        'and, only for a fact whose `why` is not null, `reason` = 1 when the brief gives that reason, else 0.',
        'Reply with exactly one JSON object whose keys are the fact numbers (as strings) and whose values are {"keeps": 0|1} or {"keeps": 0|1, "reason": 0|1}. No other text.',
    ].join('\n');
}

const binary = (value: unknown): value is 0 | 1 => value === 0 || value === 1;

export function labelsOf(reply: string, ids: readonly string[]): Readonly<Record<string, 0 | 1>> | null {
    const parsed = jsonOf(reply);
    if (parsed === null) return null;
    const found: Record<string, 0 | 1> = {};
    for (const id of ids) {
        const value = parsed[id];
        if (!binary(value)) return null;
        found[id] = value;
    }
    return found;
}

export function coverageLabelsOf(reply: string, facts: readonly { readonly n: number; readonly reason: boolean }[]): Readonly<Record<string, { readonly keeps: 0 | 1; readonly reason?: 0 | 1 }>> | null {
    const parsed = jsonOf(reply);
    if (parsed === null) return null;
    const found: Record<string, { keeps: 0 | 1; reason?: 0 | 1 }> = {};
    for (const fact of facts) {
        const entry = parsed[String(fact.n)];
        const row = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
        if (!binary(row['keeps']) || (fact.reason && !binary(row['reason']))) return null;
        found[String(fact.n)] = { keeps: row['keeps'], ...(fact.reason ? { reason: row['reason'] as 0 | 1 } : {}) };
    }
    return found;
}

function jsonOf(reply: string): Record<string, unknown> | null {
    const body = reply.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    try {
        const parsed: unknown = JSON.parse(body);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}
