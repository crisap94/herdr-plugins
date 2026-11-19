import type { HarnessAsk } from '#src/ports/harness.ts';
import type { RecapRequest } from '#src/ports/summarizer.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { TRANSCRIPT_BUDGET, writerContext } from '#src/recap/application/writer-context.ts';
import { instructions } from './recap-instructions.ts';

export { argvPrompt, fitBytes, fittedCall, message, prompt, unfenced } from './legacy.ts';
export { instructions };

export function messageText(request: RecapRequest): Text {
    return must(parseText(writerContext(request)));
}

export function promptText(request: RecapRequest): Text {
    return must(parseText(`${messageText(request)}\n\n${instructions(request)}`));
}

export function unfencedText(markdown: Text): Text {
    const trimmed = markdown.trim();
    const lines = trimmed.split('\n');
    if (lines.length >= 2 && (lines[0] ?? '').startsWith('```') && (lines.at(-1) ?? '') === '```') {
        return must(parseText(lines.slice(1, -1).join('\n').trim()));
    }
    return must(parseText(trimmed));
}

export const ARGV_BYTES: Count = must(parseCount(120_000));

export function fitText(text: Text, max: Count): Text {
    if (Buffer.byteLength(text) <= max) {
        return text;
    }
    const lines = text.split('\n');
    let used = 0;
    let from = lines.length;
    while (from > 0) {
        const need = Buffer.byteLength(lines[from - 1] ?? '') + (used > 0 ? 1 : 0);
        if (used + need > max) {
            break;
        }
        used += need;
        from -= 1;
    }
    const kept = lines.slice(from).join('\n');
    if (kept !== '') {
        return must(parseText(kept));
    }
    const chars = Array.from(lines.at(-1) ?? '');
    while (chars.length > 0 && Buffer.byteLength(chars.join('')) > max) {
        chars.splice(0, Math.max(1, Math.ceil(chars.length / 20)));
    }
    return must(parseText(chars.join('')));
}

export function fittedAsk(request: RecapRequest, limit: Count): HarnessAsk {
    const rules = instructions(request);
    let budget = TRANSCRIPT_BUDGET;
    let input = writerContext(request, budget);
    while (Buffer.byteLength(input) + Buffer.byteLength(rules) > limit && budget > 0) {
        budget = budget < 500 ? 0 : Math.floor(budget / 2);
        input = writerContext(request, budget);
    }
    return { instructions: must(parseText(rules)), input: must(parseText(input)) };
}

export function argvText(request: RecapRequest): Text {
    const call = fittedAsk(request, ARGV_BYTES);
    return must(parseText(`${call.input}\n\n${call.instructions}`));
}
