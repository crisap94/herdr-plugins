import { groupsOf as grouped } from '@stateforge-labs/recap-view/unstable/groups.ts';
import type { TabLane } from '#src/ports/tab-views.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import { columnTaskOf, rowOf } from './column.ts';

export interface Group {
    readonly task: RecapTask | null;
    readonly lanes: readonly TabLane[];
}

export function groupsOf(lanes: readonly TabLane[], tasks: readonly RecapTask[]): readonly Group[] {
    const rows = new Map(lanes.map((lane) => [rowOf(lane, undefined), lane] as const));
    const columns = new Map(tasks.map((task) => [columnTaskOf(task), task] as const));
    return grouped([...rows.keys()], [...columns.keys()]).map((group) => ({
        task: group.task === null ? null : (columns.get(group.task) ?? null),
        lanes: group.lanes.flatMap((row) => rows.get(row) ?? []),
    }));
}
