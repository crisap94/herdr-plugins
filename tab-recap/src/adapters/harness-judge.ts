import type { Harness, HarnessSettings } from '#src/ports/harness.ts';
import type { CheckAnchors, Judge, JudgeTask, Said } from '#src/ports/judge.ts';
import { isUnknown, unknown } from '#src/ports/unknowable.ts';
import { judgeInstructions } from './judge-instructions.ts';
import { unfenced } from './recap-prompt.ts';

/** The judge: one job on a harness. */
export class HarnessJudge implements Judge {
    readonly label: string;
    private readonly harness: Harness;
    private readonly settings: HarnessSettings;
    private readonly anchors: CheckAnchors;

    constructor(harness: Harness, settings: HarnessSettings, anchors: CheckAnchors = new Map()) {
        this.harness = harness;
        this.settings = settings;
        this.anchors = anchors;
        this.label = `${harness.id} · ${settings.model === '' ? 'default' : settings.model} · ${settings.effort}`;
    }

    async ask(task: JudgeTask, document: string): Promise<Said> {
        const call = { instructions: judgeInstructions(task, this.anchors), input: document };
        if (this.harness.limit !== null && Buffer.byteLength(document) + Buffer.byteLength(call.instructions) > this.harness.limit) {
            return unknown({ why: 'unreadable', detail: `the document is too long for ${this.harness.id}` });
        }
        const ran = await this.harness.run(call, this.settings);
        return isUnknown(ran) ? ran : { kind: 'said', text: unfenced(ran.text), costUsd: ran.costUsd };
    }
}
