import type { Columns } from '#src/ports/columns.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { within } from './bounded.ts';

export const SHUTDOWN_MS = 15_000;

export async function shutDown(columns: Pick<Columns, 'closeEvery'>, informer: { stop(): void }, log: (line: string) => void, ms: number = SHUTDOWN_MS): Promise<void> {
    log('stopping: closing every column');
    informer.stop();
    const result = await within(columns.closeEvery(), ms, null);
    if (result === null) {
        log(`stopping: closing the columns took more than ${ms / 1000} s; leaving`);
    } else if (isUnknown(result)) {
        log(`stopping: could not close the columns (${saying(result.why)})`);
    } else {
        log(`stopping: closed ${result.closed} column${result.closed === 1 ? '' : 's'}${result.failed > 0 ? `, ${result.failed} could not be closed` : ''}`);
    }
}
