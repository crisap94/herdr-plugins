import type { HarnessAsk, HarnessChoice, HarnessPort } from '#src/ports/harness.ts';
import type { CheckAnchors, JudgeAnswer, JudgePort, JudgeTask } from '#src/ports/judge.ts';
import { isUnknown, unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
import { judgeInstructionsOf } from './prompts/judge-instructions.ts';
import { anchorChecksOf } from './prompts/legacy.ts';
import { unfencedText } from './prompts/recap-prompt.ts';

export class HarnessJudge implements JudgePort {
    readonly label: Text;
    private readonly harness: HarnessPort;
    private readonly settings: HarnessChoice;
    private readonly anchors: CheckAnchors;

    constructor(harness: HarnessPort, settings: HarnessChoice, anchors: CheckAnchors = new Map()) {
        this.harness = harness;
        this.settings = settings;
        this.anchors = anchors;
        this.label = textOf(`${harness.id} · ${settings.model === '' ? 'default' : settings.model} · ${settings.effort}`);
    }

    async ask(task: JudgeTask, document: Text): Promise<JudgeAnswer> {
        const call: HarnessAsk = { instructions: judgeInstructionsOf(task, anchorChecksOf(this.anchors)), input: document };
        if (this.harness.limit !== null && Buffer.byteLength(document) + Buffer.byteLength(call.instructions) > this.harness.limit) {
            return unknown({ why: 'unreadable', detail: causeOf(must(parseText(`the document is too long for ${this.harness.id}`))) });
        }
        const ran = await this.harness.run(call, this.settings);
        return isUnknown(ran) ? ran : { kind: 'said', text: unfencedText(ran.text), costUsd: ran.costUsd };
    }
}
