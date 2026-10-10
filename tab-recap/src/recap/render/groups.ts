import type { TabLane } from '#src/ports/tab-views.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';

export interface Group {
    readonly task: RecapTask | null;
    readonly lanes: readonly TabLane[];
}

export function groupsOf(lanes: readonly TabLane[], tasks: readonly RecapTask[]): readonly Group[] {
    if (tasks.length <= 1) {
        return [{ task: tasks[0] ?? null, lanes }];
    }
    const held = new Set(tasks.flatMap((task) => task.lanes));
    const grouped = tasks.map((task) => ({ task, lanes: lanes.filter((lane) => task.lanes.includes(lane.pane)) })).filter((group) => group.lanes.length > 0);
    const loose = lanes.filter((lane) => !held.has(lane.pane));
    const groups: readonly Group[] = loose.length === 0 ? grouped : [...grouped, { task: null, lanes: loose }];
    const [only, ...more] = groups;
    return only !== undefined && more.length === 0 ? [{ task: only.task, lanes }] : groups;
}
