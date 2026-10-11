import { parseDirectory } from '#src/recap/domain/directory.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import { parseTaskName } from '#src/recap/domain/task-name.ts';
import type { TaskName } from '#src/recap/domain/task-name.ts';

export function directoryOf(raw: string): Directory {
    const parsed = parseDirectory(raw);
    if (parsed.kind === 'err') {
        throw new Error(`not a directory: ${raw}`);
    }
    return parsed.value;
}

export function taskNameOf(raw: string): TaskName {
    const parsed = parseTaskName(raw);
    if (parsed.kind === 'err') {
        throw new Error(`not a task name: ${raw}`);
    }
    return parsed.value;
}
