import { type DeciderPort, type DecidedAnswersResult, type Noul } from '#src/ports/decider.ts';
import type { HarnessAsk, HarnessChoice, HarnessPort } from '#src/ports/harness.ts';
import { isUnknown, unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { objectIn } from '#src/recap/application/recap-shape.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import { parseProbability, type Probability } from '#src/recap/domain/probability.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { elapsed, instant, type Instant } from '#src/recap/domain/time.ts';
import { parseTokenAmount } from '#src/recap/domain/token-amount.ts';

export function unfencedText(markdown: Text): Text {
    const trimmed = markdown.trim();
    const lines = trimmed.split('\n');
    if (lines.length >= 2 && (lines[0] ?? '').startsWith('```') && (lines.at(-1) ?? '') === '```') {
        return must(parseText(lines.slice(1, -1).join('\n').trim()));
    }
    return must(parseText(trimmed));
}

export function deciderInstructions(questions: ReadonlyMap<Text, Noul>): Text {
    const listed = [...questions].map(([id, noul]) => `- ${id}: ${noul.instructions}\n  true when: ${noul.criteria.true}\n  false when: ${noul.criteria.false}`);
    return must(parseText([
        'The input is a JSON document describing the state of some work. Answer each question below about it, independently of the others,',
        'with the probability, from 0 (certainly false) to 1 (certainly true), that its answer is true. Use the whole range; say 0.5 only when you cannot tell.',
        '', ...listed, '',
        'Reply with exactly one JSON object whose keys are the question ids above and whose values are those numbers. No other text.',
    ].join('\n')));
}

export function probabilitiesOf(reply: Text, ids: readonly Text[]): ReadonlyMap<Text, Probability> | null {
    const answer = unfencedText(reply);
    let parsed: unknown;
    try { parsed = answer.lastIndexOf('[', answer.indexOf('{')) >= 0 ? null : objectIn(answer); } catch { return null; }
    if (typeof parsed !== 'object' || parsed === null) return null;
    const found = new Map<Text, Probability>();
    for (const id of ids) {
        const value: unknown = Reflect.get(parsed, id);
        if (typeof value !== 'number') return null;
        const probability = parseProbability(value);
        if (probability === null) return null;
        found.set(id, probability);
    }
    return found;
}

export class HarnessPortDecider implements DeciderPort {
    readonly label: Text;
    private readonly harness: HarnessPort;
    private readonly choice: HarnessChoice;
    private readonly now: () => Instant;

    constructor(harness: HarnessPort, choice: HarnessChoice, now: () => Instant = (): Instant => instant(Date.now())) {
        this.harness = harness;
        this.choice = choice;
        this.now = now;
        this.label = must(parseText(`${harness.id} · ${choice.model === '' ? 'default' : choice.model} · ${choice.effort}`));
    }

    async ask(state: Text, questions: ReadonlyMap<Text, Noul>): Promise<DecidedAnswersResult> {
        const call: HarnessAsk = { instructions: deciderInstructions(questions), input: state };
        const bytes = Buffer.byteLength(call.instructions) + Buffer.byteLength(call.input);
        if (this.harness.limit !== null && bytes > this.harness.limit) return unknown({ why: 'unreadable', detail: causeOf(must(parseText(`the state is too long for ${this.harness.id}`))) });
        const began = this.now();
        const ran = await this.harness.run(call, this.choice);
        if (isUnknown(ran)) return ran;
        const answers = probabilitiesOf(ran.text, [...questions.keys()]);
        return answers === null
            ? unknown({ why: 'unreadable', detail: causeOf(must(parseText(`${this.harness.id} did not answer with one probability per question`))) })
            : { kind: 'decided', answers, tokens: must(parseTokenAmount(Math.ceil(bytes / 4))), costUsd: ran.costUsd, tookMs: elapsed(began, this.now()), model: this.harness.label(this.choice) };
    }
}
