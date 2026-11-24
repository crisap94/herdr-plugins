import { promises as fsp } from 'node:fs';
import type { WorksiteReaderPort, LastCommitOutcome, UncommittedOutcome } from '#src/ports/worksite-reader.ts';
import { unknown, type Unknown } from '@stateforge-labs/session-ledger';
import { must, type Result } from '@stateforge-labs/session-ledger';
import { parseCount } from '@stateforge-labs/session-ledger';
import { parseDirectory } from '@stateforge-labs/session-ledger';
import type { Directory } from '@stateforge-labs/session-ledger';
import { parsePresence } from '#src/recap/domain/presence.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { parseText, textOf } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';
import { TIMEOUT_MS } from './constants.ts';
import { handleOf, notARepository, openRepo, unreadable, withinBudget } from './reach.ts';
import type { Handle } from './reach.ts';
import { lastCommitOf } from './reach-history.ts';
import { changesOf } from './reach-status.ts';

const okOrNull = <T, E>(result: Result<T, E>): T | null => (result.kind === 'ok' ? result.value : null);

const presenceOf = (directory: Directory): Promise<Presence> =>
    fsp.stat(directory).then((found) => must(parsePresence(found.isDirectory() ? 'present' : 'absent')), () => must(parsePresence('absent')));

export class GitWorksite implements WorksiteReaderPort {
    lastCommit(directory: Text): Promise<LastCommitOutcome> {
        return this.within(directory, async (handle: Handle): Promise<LastCommitOutcome> => {
            const commit = await lastCommitOf(handle);
            return commit === null ? unknown({ why: 'not-found', what: textOf('commit') }) : { kind: 'commit', ...commit };
        });
    }

    uncommitted(directory: Text): Promise<UncommittedOutcome> {
        return this.within(directory, async (handle: Handle): Promise<UncommittedOutcome> => {
            const changes = await changesOf(handle);
            if (changes.kind === 'err') {
                return unreadable(changes.error);
            }
            const paths = [...changes.value.tracked, ...changes.value.untracked].flatMap((path) => okOrNull(parseText(path)) ?? []);
            return { kind: 'paths', count: must(parseCount(paths.length)), paths };
        });
    }

    async within<T>(directory: Text, work: (handle: Handle) => Promise<T | Unknown>): Promise<T | Unknown> {
        const checked = parseDirectory(directory);
        if (checked.kind === 'err' || (await presenceOf(checked.value)) === 'absent') {
            return unknown({ why: 'not-found', what: textOf('directory') });
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
