import { parseDirectory } from '@stateforge-labs/session-ledger';
import type { Directory } from '@stateforge-labs/session-ledger';
import { parseTaskName } from '#src/recap/domain/task-name.ts';
import type { TaskName } from '#src/recap/domain/task-name.ts';
import { parseCount } from '@stateforge-labs/session-ledger';
import type { Count } from '@stateforge-labs/session-ledger';

export function countFrom(raw: number): Count {
    const parsed = parseCount(raw);
    if (parsed.kind === 'err') {
        throw new Error(`not a count: ${raw}`);
    }
    return parsed.value;
}

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
