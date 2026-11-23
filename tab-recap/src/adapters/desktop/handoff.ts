import { loadSettings, stateDirectory } from '#src/daemon/config.ts';
import type { Fleet } from '#src/ports/fleet.ts';
import type { HandoffPrintService } from '#src/ports/handoff-print.ts';
import type { FlushTab } from '#src/ports/frontend.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { EditTally } from '#src/recap/application/edit-tally.ts';
import { PrintedHandoffs } from '#src/recap/application/handoff-print.ts';
import { databaseFile } from '../db/database.ts';
import { openPrintStore } from '../db/print-store.ts';
import { GitLaneRepo } from '../git/lane-repo.ts';
import { GitWorksite } from '../git/worksite.ts';
import { SystemClock } from '../os/system-clock.ts';
import { modalTranscriptRegistry } from '../transcripts/registry.ts';

export function desktopPrinter(fleet: Pick<Fleet, 'read' | 'agents'>, flush: FlushTab): HandoffPrintService {
    const transcripts = modalTranscriptRegistry();
    return new PrintedHandoffs({
        openStore: () => openPrintStore(databaseFile(stateDirectory()), loadSettings().closedLaneDays),
        transcripts,
        worksite: { reader: new GitWorksite(), repo: new GitLaneRepo(new SystemClock()), edits: new EditTally(transcripts) },
        tokens: fleet,
        target: fleet.agents(),
        closedDays: loadSettings().closedLaneDays,
        now: (): Instant => instant(Date.now()),
        flush,
        log: (): void => undefined,
    });
}
