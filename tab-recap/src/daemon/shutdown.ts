import type { ColumnPanes } from '#src/ports/columns.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { duration, type Duration } from '#src/recap/domain/time.ts';
import { withinBy } from './bounded.ts';
import { parseLine, type Line } from './slots.ts';

export const SHUTDOWN_MS = 15_000;

export interface StoppableInformer {
    stop(): void;
}

export async function shutDownWithin(columns: Pick<ColumnPanes, 'closeEvery'>, informer: StoppableInformer, log: (line: Line) => void, limit: Duration = duration(SHUTDOWN_MS)): Promise<void> {
    log(parseLine('stopping: closing every column'));
    informer.stop();
    const result = await withinBy(columns.closeEvery(), limit, null);
    if (result === null) {
        log(parseLine(`stopping: closing the columns took more than ${limit / 1000} s; leaving`));
    } else if (isUnknown(result)) {
        log(parseLine(`stopping: could not close the columns (${saying(result.why)})`));
    } else {
        log(parseLine(`stopping: closed ${result.closed} column${result.closed === 1 ? '' : 's'}${result.failed > 0 ? `, ${result.failed} could not be closed` : ''}`));
    }
}
