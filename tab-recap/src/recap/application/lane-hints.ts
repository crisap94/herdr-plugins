// What the recap writer is told about each lane besides its transcript: where it works and what it touched.
import type { Lane } from '#src/recap/domain/lane.ts';
import type { LaneRepo } from '#src/ports/lane-repo.ts';
import type { LaneHint } from '#src/ports/recap-input.ts';
import type { Entry } from '#src/ports/transcripts.ts';

const FILES_SHOWN = 5;

/** The files the lane edited in these entries (tool calls of kind `edit`): distinct, the most recent last, at most FILES_SHOWN. */
export function touchedFiles(entries: readonly Entry[]): readonly string[] {
    const seen: string[] = [];
    for (const entry of entries) {
        if (entry.role === 'tool' && entry.kind === 'edit' && entry.text !== '') {
            seen.splice(0, seen.length, ...seen.filter((known) => known !== entry.text), entry.text);
        }
    }
    return seen.slice(-FILES_SHOWN);
}

export async function hintOf(lane: Lane, entries: readonly Entry[], repos: LaneRepo): Promise<LaneHint> {
    const found = lane.cwd === null ? null : await repos.repoOf(lane.cwd);
    return {
        cwd: lane.cwd,
        repo: found?.kind === 'repo' ? found.root : null,
        branch: found?.kind === 'repo' ? found.branch : null,
        files: touchedFiles(entries),
    };
}
