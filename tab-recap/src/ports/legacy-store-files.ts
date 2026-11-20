import { err, ok, type Result } from '#src/protocol/result.ts';
import type { HiddenState } from '#src/recap/domain/board.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import type { LaneCursor, TabRecap } from '#src/ports/recap-records.ts';
import type { VisibilityRequest } from '#src/ports/requests.ts';
import type { TabLane, TabView } from '#src/ports/tab-views.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';

type Row = Record<string, unknown>;
type Text = string;
type Count = number;

export type LegacyRecapFile = Row;
export type LegacyViewFile = Row;
export type LegacyHidden = Row;
export type LegacyVisibility = Row;

const isRow = (input: unknown): input is Row => typeof input === 'object' && input !== null;

const isText = (input: unknown): input is Text => typeof input === 'string';

const isCount = (input: unknown): input is Count => typeof input === 'number';

const sectionsOf = (value: Row): RecapSections => ({
    goal: typeof value.goal === 'string' ? value.goal : '',
    now: Array.isArray(value.now) ? value.now.filter(isText) : [],
    needs: Array.isArray(value.needs) ? value.needs.filter(isText) : [],
    done: Array.isArray(value.done) ? value.done.filter(isText) : [],
    decisions: Array.isArray(value.decisions) ? value.decisions.filter(isText) : [],
    next: Array.isArray(value.next) ? value.next.filter(isText) : [],
    links: Array.isArray(value.links) ? value.links.filter(isText) : [],
    rules: [],
});

const taskOf = (item: Row): RecapTask => ({
    id: typeof item.id === 'string' ? item.id : '',
    name: typeof item.name === 'string' ? item.name : '',
    lanes: Array.isArray(item.lanes) ? item.lanes.filter(isText) : [],
    sections: isRow(item.sections) ? sectionsOf(item.sections) : null,
    markdown: typeof item.markdown === 'string' ? item.markdown : '',
});

const legacyTasks = (stored: Row): RecapTask[] => {
    const markdown = typeof stored.markdown === 'string' ? stored.markdown : '';
    if (markdown === '') return [];
    const lanes = Array.isArray(stored.lanes) ? stored.lanes.flatMap((lane) => (isRow(lane) && isText(lane.pane) ? [lane.pane] : [])) : [];
    return [{ id: 't1', name: '', lanes, sections: isRow(stored.sections) ? sectionsOf(stored.sections) : null, markdown }];
};

const tasksOf = (stored: Row): Result<RecapTask[], ParseFailure> => {
    if (!Array.isArray(stored.tasks)) return ok(legacyTasks(stored));
    const tasks: RecapTask[] = [];
    for (const [index, item] of stored.tasks.entries()) {
        if (!isRow(item)) return err({ kind: 'not-a-row' });
        const task = taskOf(item);
        tasks.push(task.id === '' ? { ...task, id: `t${index + 1}` } : task);
    }
    return ok(tasks);
};

const cursorOf = (input: Row): Result<LaneCursor, ParseFailure> => {
    if (!isText(input.pane)) return err({ kind: 'not-a-string' });
    if (!isText(input.agent)) return err({ kind: 'not-a-string' });
    if (!isText(input.transcript)) return err({ kind: 'not-a-string' });
    if (!isCount(input.cursor)) return err({ kind: 'not-a-number' });
    return ok({
        pane: input.pane,
        agent: input.agent,
        transcript: input.transcript,
        cursor: input.cursor,
        tail: typeof input.tail === 'string' ? input.tail : null,
        title: typeof input.title === 'string' ? input.title : null,
        lastPrompt: typeof input.lastPrompt === 'string' ? input.lastPrompt : null,
        claudeRecap: typeof input.claudeRecap === 'string' ? input.claudeRecap : null,
    });
};

const laneOf = (input: Row): Result<TabLane, ParseFailure> => {
    if (!isText(input.pane)) return err({ kind: 'not-a-string' });
    if (!isText(input.agent)) return err({ kind: 'not-a-string' });
    if (!isText(input.status)) return err({ kind: 'not-a-string' });
    return ok({
        pane: input.pane,
        agent: input.agent,
        status: input.status,
        title: typeof input.title === 'string' ? input.title : null,
        cwd: typeof input.cwd === 'string' ? input.cwd : null,
        lastPrompt: typeof input.lastPrompt === 'string' ? input.lastPrompt : null,
        web: null,
        context: null,
    });
};

const cursorsOf = (stored: Row): Result<LaneCursor[], ParseFailure> => {
    if (!Array.isArray(stored.lanes)) return err({ kind: 'not-a-row' });
    const lanes: LaneCursor[] = [];
    for (const item of stored.lanes) {
        if (!isRow(item)) return err({ kind: 'not-a-row' });
        const cursor = cursorOf(item);
        if (cursor.kind === 'err') return cursor;
        lanes.push(cursor.value);
    }
    return ok(lanes);
};

const viewLanesOf = (input: Row): Result<TabLane[], ParseFailure> => {
    const laneItems = input.lanes ?? [];
    if (!Array.isArray(laneItems)) return err({ kind: 'not-a-row' });
    const lanes: TabLane[] = [];
    for (const item of laneItems) {
        if (!isRow(item)) return err({ kind: 'not-a-row' });
        const lane = laneOf(item);
        if (lane.kind === 'err') return lane;
        lanes.push(lane.value);
    }
    return ok(lanes);
};

type RecapMeta = Pick<TabRecap, 'at' | 'running' | 'backend' | 'error' | 'language'>;

const recapMetaOf = (input: Row): RecapMeta => ({
    at: typeof input.at === 'number' ? input.at : null,
    running: input.running === true,
    backend: typeof input.backend === 'string' ? input.backend : null,
    error: typeof input.error === 'string' ? input.error : null,
    language: typeof input.language === 'string' && input.language !== '' ? input.language : 'en',
});

export function parseLegacyRecapFile(input: unknown): Result<TabRecap, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    if (!isText(input.tab)) return err({ kind: 'not-a-string' });
    const lanes = cursorsOf(input);
    if (lanes.kind === 'err') return lanes;
    const tasks = tasksOf(input);
    if (tasks.kind === 'err') return tasks;
    if (!isCount(input.costUsd)) return err({ kind: 'not-a-number' });
    return ok({ tab: input.tab, lanes: lanes.value, tasks: tasks.value, costUsd: input.costUsd, ...recapMetaOf(input) });
}

export function parseLegacyViewFile(input: unknown): Result<TabView, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    if (!isText(input.tab)) return err({ kind: 'not-a-string' });
    const lanes = viewLanesOf(input);
    if (lanes.kind === 'err') return lanes;
    if (!isCount(input.at)) return err({ kind: 'not-a-number' });
    return ok({
        tab: input.tab,
        column: typeof input.column === 'string' ? input.column : null,
        lanes: lanes.value,
        at: input.at,
        daemonVersion: typeof input.daemonVersion === 'string' ? input.daemonVersion : null,
    });
}

export function parseLegacyHidden(input: unknown): Result<HiddenState, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    return ok({
        all: input.all === true,
        hidden: Array.isArray(input.hidden) ? input.hidden.filter(isText) : [],
        shown: Array.isArray(input.shown) ? input.shown.filter(isText) : [],
    });
}

export function parseLegacyVisibility(input: unknown): Result<VisibilityRequest, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    if (!isText(input.target)) return err({ kind: 'not-a-string' });
    if (input.target === '') return err({ kind: 'empty' });
    if (input.hidden === 'toggle') return ok({ target: input.target, hidden: 'toggle' });
    if (typeof input.hidden !== 'boolean') return err({ kind: 'out-of-range' });
    return ok({ target: input.target, hidden: input.hidden });
}
