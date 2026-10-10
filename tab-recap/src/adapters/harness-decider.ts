import type { Decider, DecidedResult, Noul } from '#src/ports/decider.ts';
import type { Harness, HarnessSettings } from '#src/ports/harness.ts';
import { isUnknown, unknown } from '#src/ports/unknowable.ts';
import { unfenced } from './recap-prompt.ts';

const text = (part: string | object): string => (typeof part === 'string' ? part : JSON.stringify(part));

export function deciderInstructions(questions: Readonly<Record<string, Noul>>): string {
    const listed = Object.entries(questions).map(([id, noul]) => `- ${id}: ${text(noul.instructions)}\n  true when: ${text(noul.criteria.true)}\n  false when: ${text(noul.criteria.false)}`);
    return [
        'The input is a JSON document describing the state of some work. Answer each question below about it, independently of the others,',
        'with the probability, from 0 (certainly false) to 1 (certainly true), that its answer is true. Use the whole range; say 0.5 only when you cannot tell.',
        '', ...listed, '',
        'Reply with exactly one JSON object whose keys are the question ids above and whose values are those numbers. No other text.',
    ].join('\n');
}

export function probabilitiesOf(reply: string, ids: readonly string[]): Record<string, number> | null {
    let parsed: unknown;
    try { parsed = JSON.parse(unfenced(reply)); } catch { return null; }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const found: Record<string, number> = {};
    for (const id of ids) {
        const value = (parsed as Record<string, unknown>)[id];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return null;
        found[id] = value;
    }
    return found;
}

export class HarnessDecider implements Decider {
    readonly label: string;
    private readonly harness: Harness;
    private readonly settings: HarnessSettings;
    private readonly now: () => number;

    constructor(harness: Harness, settings: HarnessSettings, now: () => number = Date.now) {
        this.harness = harness;
        this.settings = settings;
        this.now = now;
        this.label = `${harness.id} · ${settings.model === '' ? 'default' : settings.model} · ${settings.effort}`;
    }

    async ask(state: object, questions: Readonly<Record<string, Noul>>): Promise<DecidedResult> {
        const call = { instructions: deciderInstructions(questions), input: JSON.stringify(state) };
        const bytes = Buffer.byteLength(call.instructions) + Buffer.byteLength(call.input);
        if (this.harness.limit !== null && bytes > this.harness.limit) return unknown({ why: 'unreadable', detail: `the state is too long for ${this.harness.id}` });
        const began = this.now();
        const ran = await this.harness.run(call, this.settings);
        if (isUnknown(ran)) return ran;
        const answers = probabilitiesOf(ran.text, Object.keys(questions));
        return answers === null
            ? unknown({ why: 'unreadable', detail: `${this.harness.id} did not answer with one probability per question` })
            : { kind: 'decided', answers, tokens: Math.ceil(bytes / 4), costUsd: ran.costUsd, tookMs: this.now() - began, model: this.harness.label(this.settings) };
    }
}
