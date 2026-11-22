import type { Lane } from '#src/recap/domain/lane-shape.ts';
import type { LaneRepo } from '#src/ports/lane-repo.ts';
import type { LaneHint } from '#src/ports/recap-input.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { touchedFiles } from './legacy.ts';

export { touchedFiles } from './legacy.ts';

export async function hintOf(lane: Lane, entries: readonly Entry[], repos: LaneRepo): Promise<LaneHint> {
    const found = lane.cwd === null ? null : await repos.repoOf(lane.cwd);
    return {
        cwd: lane.cwd,
        repo: found?.kind === 'repo' ? found.root : null,
        branch: found?.kind === 'repo' ? found.branch : null,
        files: touchedFiles(entries),
    };
}
