// Which lane headers go under which task. Pure.
import type { TabLane } from '#src/ports/recap-store.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';

/** `task` is null for lanes no task holds yet (a lane that arrived after the last recap). */
export interface Group {
    readonly task: RecapTask | null;
    readonly lanes: readonly TabLane[];
}

/**
 * The tab's lanes, grouped under the tasks that hold them (in the tab's lane order). A tab with at most one task
 * is ONE group, as it has always been drawn; several groups mean several tasks are on screen.
 */
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
