import type { Directory } from '#src/recap/domain/directory.ts';
import type { AgentKind } from '#src/recap/domain/ids.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { LastRun } from '#src/ports/recap-records.ts';

export interface ClosedView {
    readonly closedAt: Instant;
    readonly agent: AgentKind;
    readonly cwd: Directory | null;
    readonly run: LastRun | null;
}
