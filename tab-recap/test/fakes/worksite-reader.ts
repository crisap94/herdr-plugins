import { unknown, exitCodeOf } from '#src/ports/unknowable.ts';
import { causeOf } from './cause.ts';
import type { LastCommitOutcome, UncommittedOutcome, WorksiteReaderPort } from '#src/ports/worksite-reader.ts';
import { countOf } from '#src/recap/domain/count.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';

interface Worksite {
    readonly commit: { readonly hash: string; readonly subject: string } | null;
    readonly paths: readonly string[];
}

export class MemoryWorksite implements WorksiteReaderPort {
    private readonly sites = new Map<string, Worksite>();

    set(directory: string, site: Worksite): void {
        this.sites.set(directory, site);
    }

    lastCommit(directory: Text): Promise<LastCommitOutcome> {
        const site = this.sites.get(directory);
        if (site === undefined) {
            return Promise.resolve(unknown({ why: 'not-found', what: textOf('directory') }));
        }
        const { commit } = site;
        return Promise.resolve(commit === null ? unknown({ why: 'failed', code: exitCodeOf(128), detail: causeOf('no commits yet') }) : { kind: 'commit', hash: textOf(commit.hash), subject: textOf(commit.subject) });
    }

    uncommitted(directory: Text): Promise<UncommittedOutcome> {
        const site = this.sites.get(directory);
        if (site === undefined) {
            return Promise.resolve(unknown({ why: 'not-found', what: textOf('directory') }));
        }
        return Promise.resolve({ kind: 'paths', count: countOf(site.paths.length), paths: site.paths.map(textOf) });
    }
}
