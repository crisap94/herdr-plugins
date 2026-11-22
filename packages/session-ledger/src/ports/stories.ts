import type { TaskId } from '#src/recap/domain/fact.ts';
import type { CloseOp, UpdateOp } from '#src/recap/domain/ops.ts';
import type { TabId } from '#src/recap/domain/lane-shape.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { Applied } from './ledger.ts';

export interface Story {
    readonly text: Text;
    readonly at: Instant;
}

export interface CurationRun {
    readonly task: TaskId;
    readonly at: Instant;
    readonly language: Text;
}

export interface StoryChange {
    readonly story: Text | null;
    readonly merges: readonly CloseOp[];
    readonly reconciled?: readonly (UpdateOp | CloseOp)[];
}

export interface Stories {
    read(tab: TabId, task: Text): Story | null;
    keep(run: CurationRun, change: StoryChange): Applied;
}
