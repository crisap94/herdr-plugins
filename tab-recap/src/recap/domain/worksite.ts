export interface EditedFile {
    readonly path: string;
    readonly edits: number;
}

export interface WorksiteFacts {
    readonly directory: string;
    readonly repository: { readonly root: string; readonly branch: string | null } | null;
    readonly lastCommit: { readonly hash: string; readonly subject: string } | null;
    readonly uncommitted: { readonly count: number; readonly paths: readonly string[] } | null;
    readonly edited: readonly EditedFile[];
    readonly tokens: readonly string[];
}

export type WorksiteSnapshot = { readonly kind: 'unavailable' } | ({ readonly kind: 'known' } & WorksiteFacts);
