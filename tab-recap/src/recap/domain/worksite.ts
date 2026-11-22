import type { Count } from './count.ts';
import type { Directory } from './directory.ts';
import type { Text } from './text.ts';

export interface EditedFile {
    readonly path: Text;
    readonly edits: Count;
}

interface RepositoryFacts {
    readonly root: Directory;
    readonly branch: Text | null;
}

interface CommitFacts {
    readonly hash: Text;
    readonly subject: Text;
}

interface UncommittedFacts {
    readonly count: Count;
    readonly paths: readonly Text[];
}

export interface WorksiteFacts {
    readonly directory: Directory;
    readonly repository: RepositoryFacts | null;
    readonly lastCommit: CommitFacts | null;
    readonly uncommitted: UncommittedFacts | null;
    readonly edited: readonly EditedFile[];
    readonly tokens: readonly Text[];
}

export type WorksiteSnapshot = { readonly kind: 'unavailable' } | ({ readonly kind: 'known' } & WorksiteFacts);
