import type { HarnessAsk, HarnessChoice, HarnessPort } from '#src/ports/harness.ts';
import type { AnchorChecks, JudgeAnswer, JudgePort, JudgeTask } from '#src/ports/judge.ts';
import { isUnknown, unknown } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { causeOf } from '@stateforge-labs/session-ledger';
import { parseText, textOf, type Text } from '@stateforge-labs/session-ledger';
import { judgeInstructionsOf } from './prompts/judge-instructions.ts';
import { unfencedText } from './prompts/recap-prompt.ts';

export class HarnessJudge implements JudgePort {
    readonly label: Text;
    private readonly harness: HarnessPort;
    private readonly settings: HarnessChoice;
    private readonly anchors: AnchorChecks;

    constructor(harness: HarnessPort, settings: HarnessChoice, anchors: AnchorChecks = new Map()) {
        this.harness = harness;
        this.settings = settings;
        this.anchors = anchors;
        this.label = textOf(`${harness.id} · ${settings.model === '' ? 'default' : settings.model} · ${settings.effort}`);
    }

    async ask(task: JudgeTask, document: Text): Promise<JudgeAnswer> {
        const call: HarnessAsk = { instructions: judgeInstructionsOf(task, this.anchors), input: document };
        if (this.harness.limit !== null && Buffer.byteLength(document) + Buffer.byteLength(call.instructions) > this.harness.limit) {
            return unknown({ why: 'unreadable', detail: causeOf(must(parseText(`the document is too long for ${this.harness.id}`))) });
        }
        const ran = await this.harness.run(call, this.settings);
        return isUnknown(ran) ? ran : { kind: 'said', text: unfencedText(ran.text), costUsd: ran.costUsd };
    }
}
