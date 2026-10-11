import { unknown } from '#src/ports/unknowable.ts';
import type { LastCommitResult, UncommittedResult, WorksiteReader } from '#src/ports/worksite-reader.ts';

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
            return Promise.resolve(unknown({ why: 'not-found', what: 'directory' }));
        }
        const { commit } = site;
        return Promise.resolve(commit === null ? unknown({ why: 'failed', code: 128, detail: 'no commits yet' }) : { kind: 'commit', ...commit });
    }

    uncommitted(directory: string): Promise<UncommittedResult> {
        const site = this.sites.get(directory);
        if (site === undefined) {
            return Promise.resolve(unknown({ why: 'not-found', what: 'directory' }));
        }
        return Promise.resolve({ kind: 'paths', count: site.paths.length, paths: site.paths });
    }
}
