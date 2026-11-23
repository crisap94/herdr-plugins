import { fitBytes, unfenced } from '@stateforge-labs/harness-adapters/text';

import type { HarnessAsk } from '#src/ports/harness.ts';
import type { RecapRequest } from '#src/ports/summarizer.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { TRANSCRIPT_BUDGET, writerContext } from '#src/recap/application/writer-context.ts';
import { instructions } from './recap-instructions.ts';

export { instructions };

export function unfencedText(markdown: Text): Text {
    return must(parseText(unfenced(markdown)));
}

export function messageText(request: RecapRequest): Text {
    return must(parseText(writerContext(request)));
}

export function promptText(request: RecapRequest): Text {
    return must(parseText(`${messageText(request)}\n\n${instructions(request)}`));
}

export const ARGV_BYTES: Count = must(parseCount(120_000));

export function fitText(text: Text, max: Count): Text {
    return must(parseText(fitBytes(text, max)));
}

export function fittedAsk(request: RecapRequest, limit: Count): HarnessAsk {
    const rules = instructions(request);
    let budget: Count = TRANSCRIPT_BUDGET;
    let input = writerContext(request, budget);
    while (Buffer.byteLength(input) + Buffer.byteLength(rules) > limit && budget > 0) {
        budget = must(parseCount(budget < 500 ? 0 : Math.floor(budget / 2)));
        input = writerContext(request, budget);
    }
    return { instructions: rules, input: must(parseText(input)) };
}

export function argvText(request: RecapRequest): Text {
    const call = fittedAsk(request, ARGV_BYTES);
    return must(parseText(`${call.input}\n\n${call.instructions}`));
}
