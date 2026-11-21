import { promises as fsp } from 'node:fs';
import type { WorksiteReaderPort, LastCommitOutcome, UncommittedOutcome } from '#src/ports/worksite-reader.ts';
import { unknown, type Unknown } from '#src/ports/unknowable.ts';
import { must, type Result } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import { parsePresence } from '#src/recap/domain/presence.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { TIMEOUT_MS } from './constants.ts';
import { handleOf, notARepository, openRepo, unreadable, withinBudget } from './reach.ts';
import type { Handle } from './reach.ts';
import { lastCommitOf } from './reach-history.ts';
import { changesOf } from './reach-status.ts';

export { GitWorksiteReader } from './legacy.ts';

const okOrNull = <T, E>(result: Result<T, E>): T | null => (result.kind === 'ok' ? result.value : null);

const presenceOf = (directory: Directory): Promise<Presence> =>
    fsp.stat(directory).then((found) => must(parsePresence(found.isDirectory() ? 'present' : 'absent')), () => must(parsePresence('absent')));

export class GitWorksite implements WorksiteReaderPort {
    lastCommit(directory: Text): Promise<LastCommitOutcome> {
        return this.read(directory, async (handle: Handle): Promise<LastCommitOutcome> => {
            const commit = await lastCommitOf(handle);
            const hash = commit === null ? null : okOrNull(parseText(commit.hash));
            const subject = commit === null ? null : okOrNull(parseText(commit.subject));
            return hash === null || subject === null ? unknown({ why: 'not-found', what: 'commit' }) : { kind: 'commit', hash, subject };
        });
    }

    uncommitted(directory: Text): Promise<UncommittedOutcome> {
        return this.read(directory, async (handle: Handle): Promise<UncommittedOutcome> => {
            const changes = await changesOf(handle);
            if (changes.kind === 'err') {
                return unreadable(changes.error);
            }
            const paths = [...changes.value.tracked, ...changes.value.untracked].flatMap((path) => okOrNull(parseText(path)) ?? []);
            return { kind: 'paths', count: must(parseCount(paths.length)), paths };
        });
    }

    private async read<T>(directory: Text, work: (handle: Handle) => Promise<T | Unknown>): Promise<T | Unknown> {
        const checked = parseDirectory(directory);
        if (checked.kind === 'err' || (await presenceOf(checked.value)) === 'absent') {
            return unknown({ why: 'not-found', what: 'directory' });
        }
        return withinBudget(TIMEOUT_MS, async (deadline) => {
            const lookup = await openRepo(checked.value, fsp);
            if (lookup.kind !== 'worktree') {
                return lookup.kind === 'no-repo' ? notARepository() : lookup;
            }
            return work(handleOf(lookup.worktree, deadline, fsp));
        });
    }
}
