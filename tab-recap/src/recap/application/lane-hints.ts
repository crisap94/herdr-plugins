// What the recap writer is told about each lane besides its transcript: where it works and what it touched.
import type { Lane } from '#src/recap/domain/lane.ts';
import type { LaneRepo } from '#src/ports/lane-repo.ts';
import type { LaneHint } from '#src/ports/summarizer.ts';
import type { Entry } from '#src/ports/transcripts.ts';

const FILES_SHOWN = 5;
/** `Edit: src/a.ts` — the tool briefs of the tools that change a file */
const EDITS = /^(?:Edit|MultiEdit|Write|NotebookEdit|apply_patch|edit|write|patch): (\S+)$/;

/** The files the lane edited in these entries: distinct, the most recent last, at most FILES_SHOWN. */
export function touchedFiles(entries: readonly Entry[]): readonly string[] {
    const seen: string[] = [];
    for (const entry of entries) {
        const file = entry.role === 'tool' ? EDITS.exec(entry.text)?.[1] : undefined;
        if (file !== undefined) {
            seen.splice(0, seen.length, ...seen.filter((known) => known !== file), file);
        }
    }
    return seen.slice(-FILES_SHOWN);
}

export async function hintOf(lane: Lane, label: string, entries: readonly Entry[], repos: LaneRepo): Promise<LaneHint> {
    const found = lane.cwd === null ? null : await repos.repoOf(lane.cwd);
    return {
        pane: String(lane.pane), label, cwd: lane.cwd,
        repo: found?.kind === 'repo' ? found.root : null,
        branch: found?.kind === 'repo' ? found.branch : null,
        files: touchedFiles(entries),
    };
}
