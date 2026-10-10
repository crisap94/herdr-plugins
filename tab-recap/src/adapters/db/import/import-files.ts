import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { writeTx } from '../connection.ts';
import type { Store } from '../database.ts';
import { canonicalRecap, canonicalView, holdsAnything, recapDifferences, viewDifferences } from './equivalence.ts';
import { attempt, RowsWriter } from './import-rows.ts';
import type { LegacyFiles } from './legacy-files.ts';

export interface ImportReport {
    readonly recaps: number;
    readonly views: number;
    readonly requests: number;
    readonly visibility: number;
    readonly hidden: boolean;
    readonly differences: readonly string[];
}

export type ImportOutcome =
    | { readonly kind: 'already' }
    | { readonly kind: 'nothing' }
    | { readonly kind: 'imported'; readonly report: ImportReport; readonly movedTo: string | null }
    | { readonly kind: 'failed'; readonly report: ImportReport | null; readonly why: string };

export interface ImportOptions {
    readonly now: () => number;
    readonly afterInsert?: () => void;
}

const FILES = ['recaps', 'tabs', 'requests', 'visibility', 'hidden.json'];

export function loadAndCompare(store: Store, legacy: LegacyFiles, now: number): ImportReport {
    const writer = new RowsWriter(store.db);
    const recaps = legacy.recaps().map(canonicalRecap).filter(holdsAnything);
    const views = legacy.views().map(canonicalView);
    const hidden = legacy.readHidden();
    const refresh = legacy.pendingRequests();
    const visibility = legacy.pendingVisibility();
    const refused = [
        ...recaps.map((file) => attempt(store.db, `recap ${file.tab}`, () => { writer.recap(file, now); })),
        ...views.map((file) => attempt(store.db, `view ${file.tab}`, () => { writer.view(file); })),
        attempt(store.db, 'hidden', () => { if (hidden !== null) { writer.hidden(hidden); } }),
        attempt(store.db, 'requests', () => { writer.requests(refresh, visibility, now); }),
    ].flatMap((message) => message ?? []);
    const differences = [
        ...refused,
        ...recaps.flatMap((file) => recapDifferences(file, store.records.readRecap(file.tab))),
        ...views.flatMap((file) => viewDifferences(file, store.views.readTab(file.tab))),
        ...(hidden !== null && JSON.stringify(store.visibility.readHidden()) !== JSON.stringify(hidden) ? ['hidden: reads back differently'] : []),
    ];
    return { recaps: recaps.length, views: views.length, requests: refresh.length, visibility: visibility.length, hidden: hidden !== null, differences };
}

function moveAside(root: string, now: number): string {
    const target = join(root, `legacy-files-${new Date(now).toISOString().replaceAll(/[-:.]/g, '')}`);
    mkdirSync(target, { recursive: true });
    for (const name of FILES.filter((file) => existsSync(join(root, file)))) {
        renameSync(join(root, name), join(target, name));
    }
    return target;
}

const importedAt = (store: Store): number | null => (store.db.prepare('SELECT files_imported_at AS at FROM store_meta WHERE id = 1').get() as { at: number | null } | undefined)?.at ?? null;

export function importFiles(store: Store, legacy: LegacyFiles, options: ImportOptions): ImportOutcome {
    if (importedAt(store) !== null) {
        return { kind: 'already' };
    }
    const now = options.now();
    const seen: { report: ImportReport | null } = { report: null };
    try {
        writeTx(store.db, () => {
            seen.report = legacy.exists() ? loadAndCompare(store, legacy, now) : null;
            options.afterInsert?.();
            if (seen.report !== null && seen.report.differences.length > 0) {
                throw new Error(`${seen.report.differences.length} difference(s): ${seen.report.differences.slice(0, 3).join('; ')}`);
            }
            store.db.prepare('UPDATE store_meta SET files_imported_at = ? WHERE id = 1').run(now);
        });
    } catch (error) {
        return { kind: 'failed', report: seen.report, why: error instanceof Error ? error.message : String(error) };
    }
    return seen.report === null ? { kind: 'nothing' } : { kind: 'imported', report: seen.report, movedTo: moveAside(legacy.root, now) };
}
