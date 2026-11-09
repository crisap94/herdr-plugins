import type { HarnessCall } from '#src/ports/harness.ts';
import type { RecapRequest } from '#src/ports/summarizer.ts';
import { TRANSCRIPT_BUDGET, writerContext } from '#src/recap/application/writer-context.ts';
import { instructions } from './recap-instructions.ts';

export { instructions };

export function message(request: RecapRequest): string {
    return writerContext(request);
}

export const prompt = (request: RecapRequest): string => `${message(request)}\n\n${instructions(request)}`;

export function unfenced(markdown: string): string {
    const trimmed = markdown.trim();
    const lines = trimmed.split('\n');
    if (lines.length >= 2 && (lines[0] ?? '').startsWith('```') && (lines.at(-1) ?? '') === '```') {
        return lines.slice(1, -1).join('\n').trim();
    }
    return trimmed;
}

export const ARGV_BYTES = 120_000;

export function fitBytes(text: string, max: number): string {
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
        return kept;
    }
    const chars = Array.from(lines.at(-1) ?? '');
    while (chars.length > 0 && Buffer.byteLength(chars.join('')) > max) {
        chars.splice(0, Math.max(1, Math.ceil(chars.length / 20)));
    }
    return chars.join('');
}

export function fittedCall(request: RecapRequest, limit: number): HarnessCall {
    const rules = instructions(request);
    let budget = TRANSCRIPT_BUDGET;
    let input = writerContext(request, budget);
    while (Buffer.byteLength(input) + Buffer.byteLength(rules) > limit && budget > 0) {
        budget = budget < 500 ? 0 : Math.floor(budget / 2);
        input = writerContext(request, budget);
    }
    return { instructions: rules, input };
}

export function argvPrompt(request: RecapRequest): string {
    const call = fittedCall(request, ARGV_BYTES);
    return `${call.input}\n\n${call.instructions}`;
}
