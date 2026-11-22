import { unknown, type Unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import { parseProbability, type Probability } from '#src/recap/domain/probability.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { parseTokenAmount, type TokenAmount } from '#src/recap/domain/token-amount.ts';
import { parseRowOrEmpty } from '../transcripts/jsonl.ts';

export interface JevReply {
    readonly kind: 'reply';
    readonly answers: ReadonlyMap<Text, Probability>;
    readonly inputTokens: TokenAmount;
    readonly model: Text | null;
}

export function parseJevReply(body: unknown, ids: readonly Text[]): JevReply | Unknown {
    const reply = parseRowOrEmpty(body);
    const answers = new Map<Text, Probability>();
    for (const id of ids) {
        const noul = parseRowOrEmpty(parseRowOrEmpty(reply['answers'])[id])['noul'];
        const probability = typeof noul === 'number' ? parseProbability(noul) : null;
        if (probability === null) return unknown({ why: 'unreadable', detail: causeOf(must(parseText(`no usable answer for ${id}`))) });
        answers.set(id, probability);
    }
    const used = parseTokenAmount(parseRowOrEmpty(reply['usage'])['input_tokens']);
    const model = reply['model'];
    return { kind: 'reply', answers, inputTokens: used.kind === 'ok' ? used.value : must(parseTokenAmount(0)), model: typeof model === 'string' ? must(parseText(model)) : null };
}
