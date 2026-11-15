import { type Decider, type DecidedResult, type Noul } from '#src/ports/decider.ts';
import { parseProbability, type Probability } from '#src/recap/domain/probability.ts';
import { parseUsd } from '#src/recap/domain/usd.ts';
import type { Harness, HarnessSettings } from '#src/ports/harness.ts';
import { isUnknown, unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { objectIn } from '#src/recap/application/recap-shape.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { parseMilliseconds } from '#src/recap/domain/time.ts';
import { unfenced } from './prompts/recap-prompt.ts';

export function deciderInstructions(questions: ReadonlyMap<Text, Noul>): string {
    const listed = [...questions].map(([id, noul]) => `- ${id}: ${noul.instructions}\n  true when: ${noul.criteria.true}\n  false when: ${noul.criteria.false}`);
    return [
        'The input is a JSON document describing the state of some work. Answer each question below about it, independently of the others,',
        'with the probability, from 0 (certainly false) to 1 (certainly true), that its answer is true. Use the whole range; say 0.5 only when you cannot tell.',
        '', ...listed, '',
        'Reply with exactly one JSON object whose keys are the question ids above and whose values are those numbers. No other text.',
    ].join('\n');
}

export function probabilitiesOf(reply: string, ids: readonly Text[]): ReadonlyMap<Text, Probability> | null {
    const answer = unfenced(reply);
    let parsed: unknown;
    try { parsed = answer.lastIndexOf('[', answer.indexOf('{')) >= 0 ? null : objectIn(answer); } catch { return null; }
    if (typeof parsed !== 'object' || parsed === null) return null;
    const found = new Map<Text, Probability>();
    for (const id of ids) {
        const value = (parsed as Record<string, unknown>)[id];
        if (typeof value !== 'number') return null;
        const probability = parseProbability(value);
        if (probability === null) return null;
        found.set(id, probability);
    }
    return found;
}

export class HarnessDecider implements Decider {
    readonly label: Text;
    private readonly harness: Harness;
    private readonly settings: HarnessSettings;
    private readonly now: () => number;

    constructor(harness: Harness, settings: HarnessSettings, now: () => number = Date.now) {
        this.harness = harness;
        this.settings = settings;
        this.now = now;
        this.label = must(parseText(`${harness.id} · ${settings.model === '' ? 'default' : settings.model} · ${settings.effort}`));
    }

    async ask(state: Text, questions: ReadonlyMap<Text, Noul>): Promise<DecidedResult> {
        const call = { instructions: deciderInstructions(questions), input: state };
        const bytes = Buffer.byteLength(call.instructions) + Buffer.byteLength(call.input);
        if (this.harness.limit !== null && bytes > this.harness.limit) return unknown({ why: 'unreadable', detail: causeOf(must(parseText(`the state is too long for ${this.harness.id}`))) });
        const began = this.now();
        const ran = await this.harness.run(call, this.settings);
        if (isUnknown(ran)) return ran;
        const answers = probabilitiesOf(ran.text, [...questions.keys()]);
        return answers === null
            ? unknown({ why: 'unreadable', detail: causeOf(must(parseText(`${this.harness.id} did not answer with one probability per question`))) })
            : { kind: 'decided', answers, tokens: must(parseCount(Math.ceil(bytes / 4))), costUsd: must(parseUsd(ran.costUsd)), tookMs: must(parseMilliseconds(Math.max(0, this.now() - began))), model: must(parseText(this.harness.label(this.settings))) };
    }
}
