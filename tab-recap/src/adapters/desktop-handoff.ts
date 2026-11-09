import { loadConfig, stateDir } from '#src/daemon/config.ts';
import type { Fleet } from '#src/ports/fleet.ts';
import type { HandoffPrinter } from '#src/ports/handoff-print.ts';
import { EditCounts } from '#src/recap/application/edit-counts.ts';
import { PrintedHandoffs } from '#src/recap/application/handoff-print.ts';
import { databasePath } from './db/database.ts';
import { openPrintStore } from './db/print-store.ts';
import { GitLaneRepo } from './git-lane-repo.ts';
import { GitWorksiteReader } from './git-worksite.ts';
import { SystemClock } from './system-clock.ts';
import { modalTranscriptRegistry } from './transcript-registry.ts';

export function desktopPrinter(fleet: Pick<Fleet, 'read' | 'agents'>): HandoffPrinter {
    const transcripts = modalTranscriptRegistry();
    return new PrintedHandoffs({
        openStore: () => openPrintStore(databasePath(stateDir()), loadConfig().closedLaneDays),
        transcripts,
        worksite: { reader: new GitWorksiteReader(), repo: new GitLaneRepo(new SystemClock()), edits: new EditCounts(transcripts) },
        tokens: fleet,
        target: fleet.agents(),
        closedDays: loadConfig().closedLaneDays,
        now: Date.now,
    });
}
