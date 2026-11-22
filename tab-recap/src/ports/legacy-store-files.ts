import { err, ok, type Result } from '#src/protocol/result.ts';
import type { HiddenState } from '#src/recap/domain/board.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import { parseTextOrNull, textOf } from '#src/recap/domain/text.ts';
import { recapRunningOf, type LaneCursor, type TabRecap } from '#src/ports/recap-records.ts';
import { cursorOf as positionOf, sourcePathOf } from '#src/ports/transcripts.ts';
import type { VisibilityRequest } from '#src/ports/requests.ts';
import type { TabLane, TabView } from '#src/ports/tab-views.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';
import { usdOf } from '#src/recap/domain/usd.ts';
import { paneIdOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/lane-shape.ts';

type Row = Record<string, unknown>;

export type LegacyRecapFile = Row;
export type LegacyViewFile = Row;
export type LegacyHidden = Row;
export type LegacyVisibility = Row;

const isRow = (input: unknown): input is Row => typeof input === 'object' && input !== null && !Array.isArray(input);

const sectionsOf = (value: Row): RecapSections => ({
    goal: typeof value.goal === 'string' ? textOf(value.goal) : textOf(''),
    now: Array.isArray(value.now) ? value.now.flatMap((entry) => (typeof entry === 'string' ? [textOf(entry)] : [])) : [],
    needs: Array.isArray(value.needs) ? value.needs.flatMap((entry) => (typeof entry === 'string' ? [textOf(entry)] : [])) : [],
    done: Array.isArray(value.done) ? value.done.flatMap((entry) => (typeof entry === 'string' ? [textOf(entry)] : [])) : [],
    decisions: Array.isArray(value.decisions) ? value.decisions.flatMap((entry) => (typeof entry === 'string' ? [textOf(entry)] : [])) : [],
    next: Array.isArray(value.next) ? value.next.flatMap((entry) => (typeof entry === 'string' ? [textOf(entry)] : [])) : [],
    links: Array.isArray(value.links) ? value.links.flatMap((entry) => (typeof entry === 'string' ? [textOf(entry)] : [])) : [],
    rules: [],
});

const taskOf = (item: Row): RecapTask => ({
    id: typeof item.id === 'string' ? textOf(item.id) : textOf(''),
    name: typeof item.name === 'string' ? textOf(item.name) : textOf(''),
    lanes: Array.isArray(item.lanes) ? item.lanes.flatMap((entry) => (typeof entry === 'string' ? [paneIdOf(entry)] : [])) : [],
    sections: isRow(item.sections) ? sectionsOf(item.sections) : null,
    markdown: typeof item.markdown === 'string' ? textOf(item.markdown) : textOf(''),
});

const legacyTasks = (stored: Row): RecapTask[] => {
    const markdown = typeof stored.markdown === 'string' ? stored.markdown : '';
    if (markdown === '') return [];
    const lanes = Array.isArray(stored.lanes) ? stored.lanes.flatMap((lane) => (isRow(lane) && typeof lane.pane === 'string' ? [paneIdOf(lane.pane)] : [])) : [];
    return [{ id: textOf('t1'), name: textOf(''), lanes, sections: isRow(stored.sections) ? sectionsOf(stored.sections) : null, markdown: textOf(markdown) }];
};

const tasksOf = (stored: Row): RecapTask[] => {
    if (!Array.isArray(stored.tasks)) return legacyTasks(stored);
    return stored.tasks.map((item, index) => {
        const task = taskOf(isRow(item) ? item : {});
        return task.id === '' ? { ...task, id: textOf(`t${index + 1}`) } : task;
    });
};

const cursorOf = (input: Row): Result<LaneCursor, ParseFailure> => {
    if (typeof input.pane !== 'string') return err({ kind: 'not-a-string' });
    if (typeof input.agent !== 'string') return err({ kind: 'not-a-string' });
    if (typeof input.transcript !== 'string') return err({ kind: 'not-a-string' });
    if (typeof input.cursor !== 'number') return err({ kind: 'not-a-number' });
    return ok({
        pane: paneId(input.pane),
        agent: agentKind(input.agent),
        transcript: sourcePathOf(input.transcript),
        cursor: positionOf(input.cursor),
        tail: parseTextOrNull(input.tail),
        title: parseTextOrNull(input.title),
        lastPrompt: parseTextOrNull(input.lastPrompt),
        claudeRecap: parseTextOrNull(input.claudeRecap),
    });
};

const laneOf = (input: Row): Result<TabLane, ParseFailure> => {
    if (typeof input.pane !== 'string') return err({ kind: 'not-a-string' });
    if (typeof input.agent !== 'string') return err({ kind: 'not-a-string' });
    if (typeof input.status !== 'string') return err({ kind: 'not-a-string' });
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
    at: typeof input.at === 'number' ? instant(input.at) : null,
    running: recapRunningOf(input.running === true),
    backend: parseTextOrNull(input.backend),
    error: parseTextOrNull(input.error),
    language: typeof input.language === 'string' && input.language !== '' ? textOf(input.language) : textOf('en'),
});

export function parseLegacyRecapFile(input: unknown): Result<TabRecap, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    if (typeof input.tab !== 'string') return err({ kind: 'not-a-string' });
    const lanes = cursorsOf(input);
    if (lanes.kind === 'err') return lanes;
    const costUsd = typeof input.costUsd === 'number' ? input.costUsd : 0;
    return ok({ tab: tabId(input.tab), lanes: lanes.value, tasks: tasksOf(input), costUsd: usdOf(costUsd), ...recapMetaOf(input) });
}

export function parseLegacyViewFile(input: unknown): Result<TabView, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    if (typeof input.tab !== 'string') return err({ kind: 'not-a-string' });
    const lanes = viewLanesOf(input);
    if (lanes.kind === 'err') return lanes;
    return ok({
        tab: input.tab,
        column: typeof input.column === 'string' ? input.column : null,
        lanes: lanes.value,
        at: typeof input.at === 'number' ? input.at : 0,
        daemonVersion: typeof input.daemonVersion === 'string' ? input.daemonVersion : null,
    });
}

export function parseLegacyHidden(input: unknown): Result<HiddenState, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    return ok({
        all: input.all === true,
        hidden: Array.isArray(input.hidden) ? input.hidden.flatMap((entry) => (typeof entry === 'string' ? [textOf(entry)] : [])) : [],
        shown: Array.isArray(input.shown) ? input.shown.flatMap((entry) => (typeof entry === 'string' ? [textOf(entry)] : [])) : [],
    });
}

export function parseLegacyVisibility(input: unknown): Result<VisibilityRequest, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    if (typeof input.target !== 'string') return err({ kind: 'not-a-string' });
    if (input.target === '') return err({ kind: 'empty' });
    if (input.hidden === 'toggle') return ok({ target: input.target, hidden: 'toggle' });
    if (typeof input.hidden !== 'boolean') return err({ kind: 'out-of-range' });
    return ok({ target: input.target, hidden: input.hidden });
}
