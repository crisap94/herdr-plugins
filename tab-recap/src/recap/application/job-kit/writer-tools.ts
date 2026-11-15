import type { Tasked } from '#src/recap/application/ops-answer.ts';
import { forTask, judge } from '#src/recap/application/ops-gating.ts';
import type { Judged, TaskGround } from '#src/recap/application/ops-gating.ts';
import { live, staged, toolOf } from '#src/recap/application/job-kit/stage.ts';
import type { Stage } from '#src/recap/application/job-kit/stage.ts';
import type { Finding, Gate } from '#src/recap/domain/gates/gate.ts';
import type { Instant } from '#src/recap/domain/time.ts';

export interface KitGround {
    readonly gates: readonly Gate[];
    readonly task: TaskGround;
    readonly at: Instant;
}

export type CallVerdict =
    | { readonly kind: 'accepted'; readonly stage: Stage }
    | { readonly kind: 'refused'; readonly stage: Stage; readonly findings: readonly Finding[] };

export function callOf(stage: Stage, call: Tasked, ground: KitGround): CallVerdict {
    const count = live(stage).length;
    const next = staged(stage, call);
    if (next.kind === 'refused') {
        const reason = next.reason === 'stage-closed' ? 'the stage is submitted' : `${toolOf(stage.job, call.op)} is not in this job's tools`;
        return { kind: 'refused', stage, findings: [{ at: count, gate: 'K', outcome: 'refuse', reason }] };
    }
    if (call.task !== ground.task.key) {
        return { kind: 'refused', stage, findings: [{ at: count, gate: 'K', outcome: 'refuse', reason: 'the call names another task' }] };
    }
    const ops = [...forTask(live(stage), ground.task.key), call.op];
    const judged = judge(ground.gates, ops, ground.task, ground.at);
    const last = ops.length - 1;
    if (judged.refused.some((finding) => finding.at === last && finding.outcome === 'refuse')) {
        return { kind: 'refused', stage, findings: judged.refused };
    }
    return { kind: 'accepted', stage: next.stage };
}

export const submitted = (stage: Stage, ground: KitGround): Judged => judge(ground.gates, forTask(live(stage), ground.task.key), ground.task, ground.at);
