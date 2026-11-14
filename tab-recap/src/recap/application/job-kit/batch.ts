import type { Judged } from '#src/recap/application/ops-gating.ts';
import { staged, stageFor } from '#src/recap/application/job-kit/stage.ts';
import type { KitJob, Stage } from '#src/recap/application/job-kit/stage.ts';
import { submitted } from '#src/recap/application/job-kit/writer-tools.ts';
import type { KitGround } from '#src/recap/application/job-kit/writer-tools.ts';
import type { Operation } from '#src/recap/domain/ops.ts';

export function batch(job: KitJob, ground: KitGround, ops: readonly Operation[]): Judged {
    let stage: Stage = stageFor(job);
    for (const op of ops) {
        stage = staged(stage, { task: ground.task.key, op }).stage;
    }
    return submitted(stage, ground);
}
