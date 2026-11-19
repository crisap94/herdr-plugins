import type { HarnessCall } from '#src/ports/harness.ts';
import type { RecapRequest } from '#src/ports/summarizer.ts';
import type { JudgeTask, CheckAnchor, CheckAnchors, AnchorCheck, AnchorChecks } from '#src/ports/judge.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { argvText, fitText, fittedAsk, messageText, promptText, unfencedText } from './recap-prompt.ts';
import { judgeInstructionsOf } from './judge-instructions.ts';
import { partText, rubricText, type Rubric } from './rubric-text.ts';

export const message = (request: RecapRequest): string => messageText(request);

export const prompt = (request: RecapRequest): string => promptText(request);

export function unfenced(markdown: string): string {
    return unfencedText(must(parseText(markdown)));
}

export function fitBytes(text: string, max: number): string {
    return fitText(must(parseText(text)), must(parseCount(max)));
}

export function fittedCall(request: RecapRequest, limit: number): HarnessCall {
    const ask = fittedAsk(request, must(parseCount(limit)));
    return { instructions: ask.instructions, input: ask.input };
}

export function argvPrompt(request: RecapRequest): string {
    return argvText(request);
}

const anchorsOf = (anchors: CheckAnchors): AnchorChecks => new Map(
    [...anchors].map(([check, list]): [Text, readonly AnchorCheck[]] => [
        must(parseText(check)),
        list.map((anchor: CheckAnchor): AnchorCheck => ({
            item: must(parseText(anchor.item)),
            verdict: anchor.pass ? 'pass' : 'fail',
            reason: must(parseText(anchor.reason)),
        })),
    ]),
);

export function judgeInstructions(task: JudgeTask, anchors: CheckAnchors = new Map()): string {
    return judgeInstructionsOf(task, anchorsOf(anchors));
}

export function partOf(markdown: string, title: string): string {
    return partText(must(parseText(markdown)), must(parseText(title)));
}

export function rubricOf(markdown: string): Rubric {
    return rubricText(must(parseText(markdown)));
}
