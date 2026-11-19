import type { ColumnTask, Row } from './model.ts';

export interface Group {
    readonly task: ColumnTask | null;
    readonly lanes: readonly Row[];
}

export function groupsOf(lanes: readonly Row[], tasks: readonly ColumnTask[]): readonly Group[] {
    if (tasks.length <= 1) {
        return [{ task: tasks[0] ?? null, lanes }];
    }
    const held = new Set(tasks.flatMap((task) => task.members));
    const grouped = tasks.map((task) => ({ task, lanes: lanes.filter((lane) => task.members.includes(lane.id)) })).filter((group) => group.lanes.length > 0);
    const loose = lanes.filter((lane) => !held.has(lane.id));
    const groups: readonly Group[] = loose.length === 0 ? grouped : [...grouped, { task: null, lanes: loose }];
    const [only, ...more] = groups;
    return only !== undefined && more.length === 0 ? [{ task: only.task, lanes }] : groups;
}
