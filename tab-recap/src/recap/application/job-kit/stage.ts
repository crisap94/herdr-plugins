import type { Operation } from '#src/recap/domain/ops.ts';
import type { Tasked } from '#src/recap/application/ops-answer.ts';

export type KitJob = 'writer' | 'reconcile' | 'story';

export type KitTool = 'ledger_add' | 'ledger_update' | 'ledger_close' | 'ledger_merge' | 'ledger_story' | 'ledger_drop' | 'ledger_list' | 'ledger_submit';

export type Catalogue = Readonly<Record<KitJob, readonly KitTool[]>>;

export const CATALOGUE: Catalogue = {
    writer: ['ledger_add', 'ledger_update', 'ledger_close', 'ledger_drop', 'ledger_list', 'ledger_submit'],
    reconcile: ['ledger_update', 'ledger_close', 'ledger_drop', 'ledger_list', 'ledger_submit'],
    story: ['ledger_merge', 'ledger_story', 'ledger_drop', 'ledger_list', 'ledger_submit'],
};

export type Listed = 'listed' | 'not-listed';

export const listedIn = (job: KitJob, tool: KitTool): Listed => (CATALOGUE[job].includes(tool) ? 'listed' : 'not-listed');

export const toolOf = (job: KitJob, op: Operation): KitTool => {
    if (op.op === 'add') return 'ledger_add';
    if (op.op === 'update') return 'ledger_update';
    return job === 'story' ? 'ledger_merge' : 'ledger_close';
};

export type StageState = 'open' | 'submitted';

export interface Stage {
    readonly job: KitJob;
    readonly calls: readonly Tasked[];
    readonly state: StageState;
}

export const stageFor = (job: KitJob): Stage => ({ job, calls: [], state: 'open' });

export type StageRefusal = 'not-in-catalogue' | 'stage-closed';

export type Staging =
    | { readonly kind: 'staged'; readonly stage: Stage }
    | { readonly kind: 'refused'; readonly stage: Stage; readonly reason: StageRefusal };

export const staged = (stage: Stage, call: Tasked): Staging => {
    if (stage.state === 'submitted') return { kind: 'refused', stage, reason: 'stage-closed' };
    if (listedIn(stage.job, toolOf(stage.job, call.op)) === 'not-listed') return { kind: 'refused', stage, reason: 'not-in-catalogue' };
    return { kind: 'staged', stage: { job: stage.job, calls: [...stage.calls, call], state: 'open' } };
};

export const live = (stage: Stage): readonly Tasked[] => stage.calls;

export const submittedStage = (stage: Stage): Stage => ({ job: stage.job, calls: stage.calls, state: 'submitted' });
