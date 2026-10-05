// State shared by the daemon (writer) and the columns (readers). Every write is
// temp-file + rename, so a column never reads half a file.
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tabId } from '#src/recap/domain/ids.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import type { HiddenState } from '#src/recap/domain/board.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import { NOTHING_HIDDEN } from '#src/ports/recap-store.ts';
import type { RecapStore, TabRecap, TabView, VisibilityRequest } from '#src/ports/recap-store.ts';

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

/** Stored sections, or null for a recap written before the fixed structure (or a damaged one). */
function sectionsOf(value: unknown): RecapSections | null {
    if (typeof value !== 'object' || value === null) {
        return null;
    }
    const fields = value as Readonly<Record<string, unknown>>;
    const list = (key: string): string[] => strings(fields[key]);
    return { goal: typeof fields['goal'] === 'string' ? fields['goal'] : '', now: list('now'), needs: list('needs'), done: list('done'), decisions: list('decisions'), next: list('next'), links: list('links') };
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

let sequence = 0;

export class FsRecapStore implements RecapStore {
    private readonly root: string;

    constructor(root: string) {
        this.root = root;
    }

    private path(kind: 'recaps' | 'tabs' | 'requests', id: string): string {
        return join(this.root, kind, kind === 'requests' ? fileKey(id) : `${fileKey(id)}.json`);
    }

    readRecap(tab: string): TabRecap | null {
        const stored = readJson(this.path('recaps', tab)) as (Omit<TabRecap, 'language' | 'sections'> & { language?: unknown; sections?: unknown }) | null;
        if (stored === null) {
            return null;
        }
        const language = typeof stored.language === 'string' && stored.language !== '' ? stored.language : 'en';
        return { ...stored, language, sections: sectionsOf(stored.sections) };
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

    readHidden(): HiddenState {
        const stored = readJson(join(this.root, 'hidden.json')) as { all?: unknown; hidden?: unknown; shown?: unknown } | null;
        return stored === null ? NOTHING_HIDDEN : { all: stored.all === true, hidden: strings(stored.hidden), shown: strings(stored.shown) };
    }

    writeHidden(state: HiddenState): void {
        writeAtomically(join(this.root, 'hidden.json'), `${JSON.stringify(state, null, 1)}\n`);
    }

    /** One file per request, named so that they are taken in the order they were made. */
    requestVisibility(request: VisibilityRequest): void {
        sequence += 1;
        writeAtomically(join(this.root, 'visibility', `${String(Date.now()).padStart(15, '0')}-${process.pid}-${sequence}.json`), JSON.stringify(request));
    }

    takeVisibility(): readonly VisibilityRequest[] {
        let names: string[] = [];
        try { names = readdirSync(join(this.root, 'visibility')); } catch { return []; }
        const found: VisibilityRequest[] = [];
        for (const name of names.filter((candidate) => candidate.endsWith('.json')).toSorted()) {
            const path = join(this.root, 'visibility', name);
            const asked = readJson(path) as { target?: unknown; hidden?: unknown } | null;
            rmSync(path, { force: true });
            if (asked !== null && typeof asked.target === 'string' && asked.target !== '' && typeof asked.hidden === 'boolean') {
                found.push({ target: asked.target, hidden: asked.hidden });
            }
        }
        return found;
    }
}
