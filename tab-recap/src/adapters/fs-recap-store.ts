// State shared by the daemon (writer) and the columns (readers). Every write is
// temp-file + rename, so a column never reads half a file.
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tabId } from '#src/recap/domain/ids.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import type { RecapStore, TabRecap, TabView } from '#src/ports/recap-store.ts';

/** herdr ids hold ':' — fine on Linux, but a file name should not need quoting. */
export const fileKey = (id: string): string => id.replaceAll(':', '_').replaceAll('/', '_');

export function writeAtomically(path: string, body: string): void {
    mkdirSync(join(path, '..'), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, body);
    renameSync(temporary, path);
}

function readJson(path: string): unknown {
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
        return null;
    }
}

export class FsRecapStore implements RecapStore {
    private readonly root: string;

    constructor(root: string) {
        this.root = root;
    }

    private path(kind: 'recaps' | 'tabs' | 'requests', id: string): string {
        return join(this.root, kind, kind === 'requests' ? fileKey(id) : `${fileKey(id)}.json`);
    }

    readRecap(tab: string): TabRecap | null {
        const stored = readJson(this.path('recaps', tab)) as (Omit<TabRecap, 'language'> & { language?: unknown }) | null;
        return stored === null ? null : { ...stored, language: typeof stored.language === 'string' && stored.language !== '' ? stored.language : 'en' };
    }

    writeRecap(recap: TabRecap): void {
        writeAtomically(this.path('recaps', recap.tab), `${JSON.stringify(recap, null, 1)}\n`);
    }

    readTab(tab: string): TabView | null {
        return readJson(this.path('tabs', tab)) as TabView | null;
    }

    writeTab(view: TabView): void {
        writeAtomically(this.path('tabs', view.tab), `${JSON.stringify(view, null, 1)}\n`);
    }

    request(tab: string): void {
        writeAtomically(this.path('requests', tab), tab);
    }

    takeRequests(): readonly TabId[] {
        let names: string[] = [];
        try { names = readdirSync(join(this.root, 'requests')); } catch { return []; }
        const tabs: TabId[] = [];
        for (const name of names.filter((candidate) => !candidate.endsWith('.tmp'))) {
            const path = join(this.root, 'requests', name);
            const tab = readFileSync(path, 'utf8').trim();
            rmSync(path, { force: true });
            if (tab !== '') {
                tabs.push(tabId(tab));
            }
        }
        return tabs;
    }
}
