import { promises as fsp } from 'node:fs';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import type { AheadCount, PorcelainReading } from '#src/recap/domain/porcelain.ts';
import type { StatusTier } from '#src/recap/domain/worktree.ts';
import type { StatusRead, WorktreeLocator, WorktreeLookup, WorktreeProbe } from '#src/ports/worktree-status.ts';
import { ok, type Result } from '#src/protocol/result.ts';
import { FULL_TIMEOUT_MS, TIMEOUT_MS, TRACKED_TIMEOUT_MS } from './git-constants.ts';
import { handleOf, notARepository, openRepo, unreadable, withinBudget } from './git-reach.ts';
import type { Handle } from './git-reach.ts';
import { aheadOf, headLabelOf, branchOf } from './git-reach-history.ts';
import { changesOf } from './git-reach-status.ts';

async function readingOf(handle: Handle, tier: StatusTier): Promise<StatusRead> {
    const changes = await changesOf(handle);
    if (changes.kind === 'err') {
        return unreadable(changes.error);
    }
    const label = await headLabelOf(handle);
    if (label.kind === 'err') {
        return unreadable(label.error);
    }
    const branch = await branchOf(handle);
    if (branch.kind === 'err') {
        return unreadable(branch.error);
    }
    const ahead: Result<AheadCount, ParseFailure> = branch.value === null ? ok(null) : await aheadOf(handle, branch.value);
    if (ahead.kind === 'err') {
        return unreadable(ahead.error);
    }
    const tracked: Result<Count, ParseFailure> = parseCount(changes.value.tracked.length);
    const untracked: Result<Count, ParseFailure> = parseCount(tier === 'full' ? changes.value.untracked.length : 0);
    if (tracked.kind === 'err') {
        return unreadable(tracked.error);
    }
    if (untracked.kind === 'err') {
        return unreadable(untracked.error);
    }
    const reading: PorcelainReading = { branch: label.value, ahead: ahead.value, tracked: tracked.value, untracked: untracked.value };
    return { kind: 'read', reading };
}

export class GitWorktreeLocator implements WorktreeLocator {
    async locate(cwd: Directory): Promise<WorktreeLookup> {
        return withinBudget(TIMEOUT_MS, () => openRepo(cwd, fsp));
    }
}

export class GitWorktreeProbe implements WorktreeProbe {
    async read(root: Directory, tier: StatusTier): Promise<StatusRead> {
        const full = tier === 'full';
        return withinBudget(full ? FULL_TIMEOUT_MS : TRACKED_TIMEOUT_MS, async (deadline): Promise<StatusRead> => {
            const lookup = await openRepo(root, fsp);
            if (lookup.kind !== 'worktree') {
                return lookup.kind === 'no-repo' ? notARepository() : lookup;
            }
            return readingOf(handleOf(lookup.worktree, deadline, fsp), tier);
        });
    }
}
