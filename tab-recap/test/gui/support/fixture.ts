import { ExpandedModel, type ExpandedDeps } from '#src/recap/application/expanded-view.ts';
import { guiIndexRow } from '#src/recap/application/gui-index-build.ts';
import { guiTabOf } from '#src/recap/application/gui-tab-build.ts';
import { BLANK_READS } from '#src/recap/application/gui-tab-reads.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { guiFileName, type GuiTab } from '#src/recap/domain/gui-tab.ts';
import { parseTabId } from '#src/recap/domain/ids.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import type { TabView } from '#src/ports/tab-views.ts';
import { cursor, memoryStore, must as present, seed } from '#test/db/support.ts';
import { fact } from '#test/fakes/fact-at.ts';
import { MemoryLedger } from '#test/fakes/memory-ledger.ts';
import { GUI_DIR, NOW, world } from './herdr.ts';

export const MIN = 60_000;
const ZONE = 'UTC';
const AGENT = 'claude';

export interface LaneSpec {
    readonly pane: string;
    readonly status: string;
    readonly tokens?: number;
    readonly window?: number;
    readonly title?: string;
}

export interface FactSpec {
    readonly id: string;
    readonly section: 'needs' | 'decisions' | 'now' | 'done' | 'next' | 'links';
    readonly text: string;
    readonly minutesAgo: number;
    readonly why?: string;
}

export interface TabSpec {
    readonly tab: string;
    readonly lanes: readonly LaneSpec[];
    readonly facts: readonly FactSpec[];
    readonly hint?: number;
    readonly name?: string;
}

export interface Built {
    readonly doc: Record<string, unknown>;
    readonly row: Record<string, unknown>;
    readonly typed: GuiTab;
}

export const FACTS: readonly FactSpec[] = [
    { id: 'n1', section: 'needs', text: 'Which effort should the curator default to', minutesAgo: 25, why: 'it sets the cost of every run' },
    { id: 'd1', section: 'decisions', text: 'Use sqlite for the ledger', minutesAgo: 30, why: 'one file, no server' },
    { id: 'w1', section: 'now', text: 'Running the tests', minutesAgo: 20 },
    { id: 'x1', section: 'done', text: 'Shipped the schema', minutesAgo: 10 },
    { id: 'x2', section: 'done', text: 'Merged the importer', minutesAgo: 600 },
    { id: 'u1', section: 'next', text: 'Draw the timeline', minutesAgo: 5 },
];

const viewOf = (spec: TabSpec): TabView => ({
    tab: spec.tab, column: null, at: NOW,
    lanes: spec.lanes.map((lane) => ({
        pane: lane.pane, agent: AGENT, status: lane.status, title: lane.title ?? `lane ${lane.pane}`, cwd: null,
        context: lane.tokens === undefined ? null : { tokens: lane.tokens, window: lane.window ?? 200_000, source: 'agent' }, web: null,
    })),
});

export function build(spec: TabSpec): Built {
    const store = memoryStore();
    const view = viewOf(spec);
    seed(store, { ...blankRecap(spec.tab), at: NOW - 3 * 60 * MIN, lanes: spec.lanes.map((lane) => cursor(lane.pane)), tasks: [{ id: 't1', name: '', lanes: spec.lanes.map((lane) => lane.pane), sections: { ...NO_SECTIONS, goal: 'Ship it' }, markdown: '## Goal\n- Ship it' }] });
    const ledger = new MemoryLedger();
    spec.facts.forEach((one) => ledger.seed(fact(one.id, one.section, one.text, NOW - one.minutesAgo * MIN, { task: { tab: spec.tab, key: 't1' }, why: one.why ?? null })));
    const deps: ExpandedDeps = { records: store.records, ledger, stories: store.stories, session: store.session, boundaries: store.boundaries, requests: { requestCurate: (): void => undefined }, edits: () => [] };
    const expanded = new ExpandedModel(deps).read(spec.tab, view, NOW);
    const recap = present(store.records.readRecap(spec.tab));
    const hint = spec.hint === undefined ? null : must(parseCount(spec.hint));
    const typed = guiTabOf(recap, view, instant(NOW), { ...BLANK_READS, expanded, compactHint: hint, zone: must(parseText(ZONE)) });
    const label = spec.name === undefined ? {} : { name: spec.name };
    return { doc: { ...JSON.parse(JSON.stringify(typed)), ...label }, row: { ...JSON.parse(JSON.stringify(guiIndexRow(typed))), ...label }, typed };
}

export const docPath = (tab: string): string => `${GUI_DIR}/${guiFileName(must(parseTabId(tab)))}`;

export function install(built: readonly Built[]): void {
    world.files.set(`${GUI_DIR}/index.json`, JSON.stringify({ version: 1, tabs: built.map((one) => one.row) }));
    built.forEach((one) => world.files.set(docPath(String(one.doc['tab'])), JSON.stringify(one.doc)));
}

export function live(entries: readonly { id: string; name: string; status: string | null }[]): void {
    world.spaces = [{ id: 's1', name: 'work', tabs: entries.map((one) => ({ id: one.id, name: one.name, status: one.status })) }];
}

export const NO_HINT: TabSpec = { tab: 'w1:t1', name: 'shop', lanes: [{ pane: 'w1:p1', status: 'blocked', tokens: 100_000 }, { pane: 'w1:p2', status: 'working', tokens: 40_000 }], facts: FACTS };
export const SHOP: TabSpec = { ...NO_HINT, hint: 40 };
export const BLOG: TabSpec = { tab: 'w1:t2', name: 'blog', lanes: [{ pane: 'w1:p3', status: 'working', tokens: 20_000 }], facts: [{ id: 'w9', section: 'now', text: 'Drafting posts', minutesAgo: 3 }], hint: 40 };
export const OPS: TabSpec = { tab: 'w1:t3', name: 'ops', lanes: [{ pane: 'w1:p4', status: 'done' }], facts: [{ id: 'x9', section: 'done', text: 'Rotated keys', minutesAgo: 2 }] };
export const DOCS: TabSpec = { tab: 'w1:t4', name: 'docs', lanes: [{ pane: 'w1:p5', status: 'idle' }], facts: [] };

export const LIVE = [
    { id: 'w1:t4', name: 'docs', status: 'idle' }, { id: 'w1:t2', name: 'blog', status: 'working' },
    { id: 'w1:t1', name: 'shop', status: 'blocked' }, { id: 'w1:t3', name: 'ops', status: 'done' },
];

export function fleet(): Built[] {
    const made = [SHOP, BLOG, OPS, DOCS].map(build);
    install(made);
    live(LIVE);
    return made;
}

const TASK_KEYS = new Set(['id', 'name', 'sections', 'markdown']);
export type Json = Record<string, unknown>;
const isJson = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

export function readJson(path: string): Json {
    const parsed: unknown = JSON.parse(world.files.get(path) ?? 'null');
    if (!isJson(parsed)) {
        throw new Error(`no json at ${path}`);
    }
    return parsed;
}

export function patchDoc(tab: string, change: (doc: Json) => void): void {
    const doc = readJson(docPath(tab));
    change(doc);
    world.files.set(docPath(tab), JSON.stringify(doc));
}

export function patchRow(tab: string, change: (row: Json) => void): void {
    const path = `${GUI_DIR}/index.json`;
    const index = readJson(path);
    const rows = Array.isArray(index['tabs']) ? index['tabs'] : [];
    rows.filter(isJson).filter((row) => row['tab'] === tab).forEach(change);
    world.files.set(path, JSON.stringify(index));
}

const listOf = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isJson) : []);

export function stageRecord(stage: string, ageMs: number, more: Json = {}): Json {
    return { id: 'st1', stage, queued: 'no', writer: null, brief: null, why: null, startedAt: NOW - ageMs - 5000, stageAt: NOW - ageMs, tokensBefore: 160_000, tokensAfter: 10_000, tookMs: 41_000, origin: 'operator', text: '', ...more };
}

export function setStage(tab: string, lane: number, record: Json | null): void {
    patchDoc(tab, (doc) => {
        const target = listOf(doc['lanes'])[lane];
        if (target) {
            target['compaction'] = { hint: null, stage: record };
        }
    });
    patchRow(tab, (row) => {
        const target = listOf(row['lanes'])[lane];
        if (target) {
            target['stage'] = record === null ? null : record['stage'];
        }
    });
}

export function asV1(tab: string): void {
    patchDoc(tab, (doc) => {
        const keep = new Set(['version', 'tab', 'name', 'status', 'at', 'recapAt', 'writing', 'error', 'lanes', 'tasks']);
        Object.keys(doc).filter((key) => !keep.has(key)).forEach((key) => Reflect.deleteProperty(doc, key));
        doc['version'] = 1;
        const laneKeys = new Set(['pane', 'agent', 'status', 'title', 'cwd', 'lastPrompt', 'branch', 'contextPercent', 'since']);
        listOf(doc['lanes']).forEach((lane) => Object.keys(lane).filter((key) => !laneKeys.has(key)).forEach((key) => Reflect.deleteProperty(lane, key)));
        listOf(doc['tasks']).forEach((task) => {
            Object.keys(task).filter((key) => !TASK_KEYS.has(key)).forEach((key) => Reflect.deleteProperty(task, key));
            if (isJson(task['sections'])) {
                Reflect.deleteProperty(task['sections'], 'rules');
            }
        });
    });
}
