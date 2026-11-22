import { unknown, exitCodeOf } from '#src/ports/unknowable.ts';
import { causeOf } from './cause.ts';
import type { LastCommitResult, UncommittedResult, WorksiteReader } from '#src/ports/worksite-reader.ts';
import { textOf } from '#src/recap/domain/text.ts';

interface Worksite {
    readonly commit: { readonly hash: string; readonly subject: string } | null;
    readonly paths: readonly string[];
}

export class MemoryWorksite implements WorksiteReader {
    private readonly sites = new Map<string, Worksite>();

    set(directory: string, site: Worksite): void {
        this.sites.set(directory, site);
    }

    lastCommit(directory: string): Promise<LastCommitResult> {
        const site = this.sites.get(directory);
        if (site === undefined) {
            return Promise.resolve(unknown({ why: 'not-found', what: textOf('directory') }));
        }
        const { commit } = site;
        return Promise.resolve(commit === null ? unknown({ why: 'failed', code: exitCodeOf(128), detail: causeOf('no commits yet') }) : { kind: 'commit', ...commit });
    }

    uncommitted(directory: string): Promise<UncommittedResult> {
        const site = this.sites.get(directory);
        if (site === undefined) {
            return Promise.resolve(unknown({ why: 'not-found', what: textOf('directory') }));
        }
        return Promise.resolve({ kind: 'paths', count: site.paths.length, paths: site.paths });
    }
}
