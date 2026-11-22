import { textOf, type Text } from '#src/recap/domain/text.ts';
import { countOf } from '#src/recap/domain/count.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import type { LaneRepo } from '#src/ports/lane-repo.ts';
import type { LaneCursor } from '#src/ports/recap-records.ts';
import type { LastCommitResult, UncommittedResult, WorksiteReader } from '#src/ports/worksite-reader.ts';
import { coordinationNamesOf } from '#src/recap/domain/coordination.ts';
import { FILES_SHOWN } from '#src/recap/domain/session-facts.ts';
import type { WorksiteSnapshot } from '#src/recap/domain/worksite.ts';
import type { EditSource } from './edit-tally.ts';
import { HANDOFF_PATHS_SHOWN } from './handoff-limits.ts';
import { must } from '#src/protocol/result.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';

export interface WorksiteInput {
    readonly directory: string | null;
    readonly cursor: LaneCursor | null;
    readonly tokens: ReadonlyMap<Text, Text> | null;
}

export interface WorksiteDeps {
    readonly reader: WorksiteReader;
    readonly repo: LaneRepo;
    readonly edits: EditSource;
}

function isGone(commit: LastCommitResult, uncommitted: UncommittedResult): boolean {
    return (isUnknown(commit) && commit.why.why === 'not-found') || (isUnknown(uncommitted) && uncommitted.why.why === 'not-found');
}

export async function worksiteOf(deps: WorksiteDeps, input: WorksiteInput): Promise<WorksiteSnapshot> {
    const directory = input.directory;
    if (directory === null) {
        return { kind: 'unavailable' };
    }
    const [commit, uncommitted, repo, edits] = await Promise.all([
        deps.reader.lastCommit(directory),
        deps.reader.uncommitted(directory),
        deps.repo.repoOf(must(parseDirectory(directory))),
        deps.edits.of(input.cursor === null ? [] : [input.cursor]),
    ]);
    if (isGone(commit, uncommitted)) {
        return { kind: 'unavailable' };
    }
    return {
        kind: 'known',
        directory: must(parseDirectory(directory)),
        repository: repo.kind === 'repo' ? { root: repo.root, branch: repo.branch } : null,
        lastCommit: isUnknown(commit) ? null : { hash: textOf(commit.hash), subject: textOf(commit.subject) },
        uncommitted: isUnknown(uncommitted) ? null : { count: countOf(uncommitted.count), paths: uncommitted.paths.slice(0, HANDOFF_PATHS_SHOWN).map(textOf) },
        edited: edits.slice(0, FILES_SHOWN).map((file) => ({ path: file.path, edits: file.count })),
        tokens: input.tokens === null ? [] : coordinationNamesOf(input.tokens),
    };
}
