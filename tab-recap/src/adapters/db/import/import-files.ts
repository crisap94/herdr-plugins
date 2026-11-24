import { knownOr } from '#src/ports/guarded-reads.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import { parseTabId } from '#src/recap/domain/ids.ts';
import type { TabViewRecord } from '#src/ports/tab-views.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { writeTx } from '../connection.ts';
import type { Store } from '../database.ts';
import { canonicalRecap, canonicalView, holdingOf, recapDifferenceLines, viewDifferenceLines, type Presence } from './equivalence.ts';
import { attempt, RowsWriter } from './import-rows.ts';
import type { LegacyStoreFiles } from './legacy-files.ts';

export interface ImportReport {
    readonly recaps: Count;
    readonly views: Count;
    readonly requests: Count;
    readonly visibility: Count;
    readonly hidden: Presence;
    readonly differences: readonly Text[];
}

export type ImportOutcome =
    | { readonly kind: 'already' }
    | { readonly kind: 'nothing' }
    | { readonly kind: 'imported'; readonly report: ImportReport; readonly movedTo: FsPath | null }
    | { readonly kind: 'failed'; readonly report: ImportReport | null; readonly why: Text };

export interface ImportOptions {
    readonly now: () => Instant;
    readonly afterInsert?: () => void;
}

const readBack = (store: Store, tab: Text): TabViewRecord | null => {
    const id = parseTabId(tab);
    return id.kind === 'ok' ? store.views.readTab(id.value) : null;
};

const FILES = ['recaps', 'tabs', 'requests', 'visibility', 'hidden.json'];

export function compareLegacyFiles(store: Store, legacy: LegacyStoreFiles, now: Instant): ImportReport {
    const writer = new RowsWriter(store.db);
    const recaps = legacy.recaps().map(canonicalRecap).filter((file) => holdingOf(file) === 'present');
    const views = legacy.views().map(canonicalView);
    const hidden = legacy.readHidden();
    const refresh = legacy.pendingRequests();
    const visibility = legacy.pendingVisibility();
    const refused = [
        ...recaps.map((file) => attempt(store.db, must(parseText(`recap ${file.scope}`)), () => { writer.recap(file, now); })),
        ...views.map((file) => attempt(store.db, must(parseText(`view ${file.tab}`)), () => { writer.view(file); })),
        attempt(store.db, must(parseText('hidden')), () => { if (hidden !== null) { writer.hidden(hidden); } }),
        attempt(store.db, must(parseText('requests')), () => { writer.requests(refresh, visibility, now); }),
    ].flatMap((message) => message ?? []);
    const differences = [
        ...refused,
        ...recaps.flatMap((file) => recapDifferenceLines(file, knownOr(store.records.readRecap(file.scope), null))),
        ...views.flatMap((file) => viewDifferenceLines(file, readBack(store, file.tab))),
        ...(hidden !== null && JSON.stringify(store.visibility.readHidden()) !== JSON.stringify(hidden) ? [must(parseText('hidden: reads back differently'))] : []),
    ];
    return {
        recaps: must(parseCount(recaps.length)),
        views: must(parseCount(views.length)),
        requests: must(parseCount(refresh.length)),
        visibility: must(parseCount(visibility.length)),
        hidden: hidden === null ? 'absent' : 'present',
        differences,
    };
}

function moveAside(root: FsPath, now: Instant): FsPath {
    const target = join(root, `legacy-files-${new Date(now).toISOString().replaceAll(/[-:.]/g, '')}`);
    mkdirSync(target, { recursive: true });
    for (const name of FILES.filter((file) => existsSync(join(root, file)))) {
        renameSync(join(root, name), join(target, name));
    }
    return must(parseFsPath(target));
}

const importedState = (store: Store): Presence => {
    const row: unknown = store.db.prepare('SELECT files_imported_at AS at FROM store_meta WHERE id = 1').get();
    return typeof row === 'object' && row !== null && 'at' in row && row.at !== null && row.at !== undefined ? 'present' : 'absent';
};

export function importFilesAt(store: Store, legacy: LegacyStoreFiles, options: ImportOptions): ImportOutcome {
    if (importedState(store) === 'present') {
        return { kind: 'already' };
    }
    const now = options.now();
    const seen: { report: ImportReport | null } = { report: null };
    try {
        writeTx(store.db, () => {
            seen.report = legacy.exists() === 'present' ? compareLegacyFiles(store, legacy, now) : null;
            options.afterInsert?.();
            if (seen.report !== null && seen.report.differences.length > 0) {
                throw new Error(`${seen.report.differences.length} difference(s): ${seen.report.differences.slice(0, 3).join('; ')}`);
            }
            store.db.prepare('UPDATE store_meta SET files_imported_at = ? WHERE id = 1').run(now);
        });
    } catch (error) {
        return { kind: 'failed', report: seen.report, why: must(parseText(error instanceof Error ? error.message : String(error))) };
    }
    return seen.report === null ? { kind: 'nothing' } : { kind: 'imported', report: seen.report, movedTo: moveAside(legacy.root, now) };
}
