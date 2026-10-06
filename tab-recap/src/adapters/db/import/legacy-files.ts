// The state as 1.5.1 and earlier kept it: JSON files. READ-ONLY here — the tolerant readers that know every historical
// shape (a recap before tasks, a cursor without a tail, a view without `cwd`, `lastPrompt` or `daemonVersion`).
// The import reads through this; nothing writes these files any more.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { HiddenState } from '#src/recap/domain/board.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import type { LaneCursor, TabRecap } from '#src/ports/recap-records.ts';
import type { VisibilityRequest } from '#src/ports/requests.ts';
import type { TabLane, TabView } from '#src/ports/tab-views.ts';

/** herdr ids hold ':' — fine on Linux, but a file name should not need quoting. */
export const fileKey = (id: string): string => id.replaceAll(':', '_').replaceAll('/', '_');

function readJson(path: string): unknown {
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
        return null;
    }
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

/** Stored sections, or null for a damaged value. */
function sectionsOf(value: unknown): RecapSections | null {
    if (typeof value !== 'object' || value === null) {
        return null;
    }
    const fields = value as Readonly<Record<string, unknown>>;
    return { goal: typeof fields['goal'] === 'string' ? fields['goal'] : '', now: strings(fields['now']), needs: strings(fields['needs']), done: strings(fields['done']), decisions: strings(fields['decisions']), next: strings(fields['next']), links: strings(fields['links']), rules: [] };
}

/** The tasks as stored; a recap stored before tasks existed (`sections` and `markdown` of its own) is one task holding every lane. */
function tasksOf(stored: { readonly tasks?: unknown; readonly sections?: unknown; readonly markdown?: unknown; readonly lanes?: unknown }): readonly RecapTask[] {
    if (Array.isArray(stored.tasks)) {
        return stored.tasks.map((task: Readonly<Record<string, unknown>>, at: number) => ({
            id: typeof task['id'] === 'string' && task['id'] !== '' ? task['id'] : `t${at + 1}`,
            name: typeof task['name'] === 'string' ? task['name'] : '',
            lanes: strings(task['lanes']),
            sections: sectionsOf(task['sections']),
            markdown: typeof task['markdown'] === 'string' ? task['markdown'] : '',
        }));
    }
    const markdown = typeof stored.markdown === 'string' ? stored.markdown : '';
    const lanes = Array.isArray(stored.lanes) ? stored.lanes.flatMap((lane: Readonly<Record<string, unknown>>) => (typeof lane['pane'] === 'string' ? [lane['pane']] : [])) : [];
    return markdown === '' ? [] : [{ id: 't1', name: '', lanes, sections: sectionsOf(stored.sections), markdown }];
}

function laneOf(lane: Omit<TabLane, 'cwd' | 'lastPrompt' | 'web' | 'context'> & { cwd?: unknown; lastPrompt?: unknown }): TabLane {
    return {
        pane: lane.pane, agent: lane.agent, status: lane.status, title: lane.title,
        cwd: typeof lane.cwd === 'string' ? lane.cwd : null, lastPrompt: typeof lane.lastPrompt === 'string' ? lane.lastPrompt : null, web: null, context: null,
    };
}

/** A lane's cursor as stored; one written before readers owned their positions has no tail. */
function cursorOf(cursor: Omit<LaneCursor, 'tail'> & { tail?: unknown }): LaneCursor {
    return { ...cursor, tail: typeof cursor.tail === 'string' ? cursor.tail : null };
}

type StoredRecap = Omit<TabRecap, 'language' | 'tasks' | 'lanes'> & { language?: unknown; tasks?: unknown; sections?: unknown; markdown?: unknown; lanes: readonly (Omit<LaneCursor, 'tail'> & { tail?: unknown })[] };
type StoredView = Omit<TabView, 'lanes' | 'daemonVersion'> & { lanes?: readonly (Omit<TabLane, 'cwd'> & { cwd?: unknown })[]; daemonVersion?: unknown };

export class LegacyFiles {
    readonly root: string;

    constructor(root: string) {
        this.root = root;
    }

    private names(kind: string): string[] {
        try { return readdirSync(join(this.root, kind)).filter((name) => !name.endsWith('.tmp')).toSorted(); } catch { return []; }
    }

    /** The recap in one file, as the plugin read it. */
    recapOf(stored: unknown): TabRecap | null {
        if (typeof stored !== 'object' || stored === null) {
            return null;
        }
        const file = stored as StoredRecap;
        const language = typeof file.language === 'string' && file.language !== '' ? file.language : 'en';
        return { tab: file.tab, lanes: Array.from(file.lanes, cursorOf), tasks: tasksOf(file), at: file.at, running: file.running, backend: file.backend, error: file.error, costUsd: file.costUsd, language };
    }

    viewOf(stored: unknown): TabView | null {
        if (typeof stored !== 'object' || stored === null) {
            return null;
        }
        const file = stored as StoredView;
        return { ...file, lanes: Array.from(file.lanes ?? [], laneOf), daemonVersion: typeof file.daemonVersion === 'string' ? file.daemonVersion : null };
    }

    recaps(): readonly TabRecap[] {
        return this.names('recaps').flatMap((name) => this.recapOf(readJson(join(this.root, 'recaps', name))) ?? []);
    }

    views(): readonly TabView[] {
        return this.names('tabs').flatMap((name) => this.viewOf(readJson(join(this.root, 'tabs', name))) ?? []);
    }

    readHidden(): HiddenState | null {
        const stored = readJson(join(this.root, 'hidden.json')) as { all?: unknown; hidden?: unknown; shown?: unknown } | null;
        return stored === null ? null : { all: stored.all === true, hidden: strings(stored.hidden), shown: strings(stored.shown) };
    }

    /** The refresh requests still waiting, not taken. */
    pendingRequests(): readonly string[] {
        const read = (name: string): string => { try { return readFileSync(join(this.root, 'requests', name), 'utf8').trim(); } catch { return ''; } };
        return this.names('requests').map(read).filter((tab) => tab !== '');
    }

    /** The visibility requests still waiting, oldest first. */
    pendingVisibility(): readonly VisibilityRequest[] {
        return this.names('visibility').filter((name) => name.endsWith('.json')).flatMap((name) => {
            const asked = readJson(join(this.root, 'visibility', name)) as { target?: unknown; hidden?: unknown } | null;
            return asked !== null && typeof asked.target === 'string' && asked.target !== '' && (typeof asked.hidden === 'boolean' || asked.hidden === 'toggle') ? [{ target: asked.target, hidden: asked.hidden }] : [];
        });
    }

    /** Whether anything of the old layout is there. */
    exists(): boolean {
        return ['recaps', 'tabs', 'requests', 'visibility'].some((kind) => this.names(kind).length > 0) || this.readHidden() !== null;
    }
}
