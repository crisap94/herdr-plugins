import { unknown } from '#src/ports/unknowable.ts';
import type { LastCommitResult, UncommittedResult, WorksiteReader } from '#src/ports/worksite-reader.ts';
import { parseText, textOf } from '#src/recap/domain/text.ts';
import { lastCommitOf } from './reach-history.ts';
import { GitWorksite } from './worksite.ts';

const NO_DIRECTORY = unknown({ why: 'not-found', what: textOf('directory') });

export class GitWorksiteReader implements WorksiteReader {
    private readonly worksite = new GitWorksite();

    lastCommit(directory: string): Promise<LastCommitResult> {
        const text = parseText(directory);
        if (text.kind === 'err') {
            return Promise.resolve(NO_DIRECTORY);
        }
        return this.worksite.within(text.value, async (handle): Promise<LastCommitResult> => {
            const commit = await lastCommitOf(handle);
            return commit === null ? unknown({ why: 'not-found', what: textOf('commit') }) : { kind: 'commit', ...commit };
        });
    }

    uncommitted(directory: string): Promise<UncommittedResult> {
        const text = parseText(directory);
        return text.kind === 'ok' ? this.worksite.uncommitted(text.value) : Promise.resolve(NO_DIRECTORY);
    }
}
