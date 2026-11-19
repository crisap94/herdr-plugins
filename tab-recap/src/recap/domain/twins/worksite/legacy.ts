export interface EditedFile {
    readonly path: string;
    readonly edits: number;
}

interface RepositoryFacts {
    readonly root: string;
    readonly branch: string | null;
}

interface CommitFacts {
    readonly hash: string;
    readonly subject: string;
}

interface UncommittedFacts {
    readonly count: number;
    readonly paths: readonly string[];
}

export interface WorksiteFacts {
    readonly directory: string;
    readonly repository: RepositoryFacts | null;
    readonly lastCommit: CommitFacts | null;
    readonly uncommitted: UncommittedFacts | null;
    readonly edited: readonly EditedFile[];
    readonly tokens: readonly string[];
}

export type WorksiteSnapshot = { readonly kind: 'unavailable' } | ({ readonly kind: 'known' } & WorksiteFacts);
