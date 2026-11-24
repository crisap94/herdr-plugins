import {
    instant,
    type HarnessKind,
    type ClosedWhy,
    type Cursor,
    type Fact,
    type FactId,
    type HistoryFact,
    type Instant,
    type SessionKey,
    type RecapCause,
    type RecapTask,
    type Running,
    type Section,
    type SessionCursor,
    type SourcePath,
    type ScopeId,
    type Text,
    type Usd,
} from '@stateforge-labs/session-ledger';

export type Row = Readonly<Record<string, unknown>>;

const isTextValue = (raw: string): raw is Text => raw.length >= 0;
const isTabId = (raw: string): raw is ScopeId => raw.length >= 0;
const isPaneId = (raw: string): raw is SessionKey => raw.length >= 0;
const isAgentKind = (raw: string): raw is HarnessKind => raw.length >= 0;
const isSourcePath = (raw: string): raw is SourcePath => raw.length >= 0;
const isFactId = (raw: string): raw is FactId => raw.length > 0;
const isCursor = (raw: number): raw is Cursor => Number.isSafeInteger(raw) && raw >= 0;
const isUsd = (raw: number): raw is Usd => Number.isFinite(raw);

const SECTION_NAMES: readonly Section[] = ['goal', 'now', 'needs', 'done', 'decisions', 'next', 'links', 'rules'];
const CLOSED_WHY: readonly ClosedWhy[] = ['done', 'wrong', 'superseded', 'answered', 'merged', 'rewritten'];
const CAUSES: readonly (RecapCause | 'imported')[] = ['turn-ended', 'focused', 'requested', 'imported'];

const bad = (what: string): never => {
    throw new Error(`the ledger file holds a row whose ${what} is not what was written`);
};

export const isRow = (raw: unknown): raw is Row => typeof raw === 'object' && raw !== null && !Array.isArray(raw);

const stringAt = (row: Row, column: string): string => {
    const raw = row[column];
    return typeof raw === 'string' ? raw : bad(column);
};

const numberAt = (row: Row, column: string): number => {
    const raw = row[column];
    return typeof raw === 'number' ? raw : bad(column);
};

const textAt = (row: Row, column: string): Text => {
    const raw = stringAt(row, column);
    return isTextValue(raw) ? raw : bad(column);
};

const textOrNullAt = (row: Row, column: string): Text | null => (row[column] === null ? null : textAt(row, column));

export const instantAt = (row: Row, column: string): Instant => instant(numberAt(row, column));

const instantOrNullAt = (row: Row, column: string): Instant | null => (row[column] === null ? null : instantAt(row, column));

const oneOf = <Name extends string>(names: readonly Name[], raw: string, column: string): Name => names.find((name) => name === raw) ?? bad(column);

export const causeAt = (row: Row, column: string): RecapCause | 'imported' => oneOf(CAUSES, stringAt(row, column), column);

const sessionCursorOf = (raw: unknown): SessionCursor => {
    if (!isRow(raw)) {
        return bad('lane');
    }
    const pane = stringAt(raw, 'pane');
    const agent = stringAt(raw, 'agent');
    const transcript = stringAt(raw, 'transcript');
    const cursor = numberAt(raw, 'cursor');
    if (!isPaneId(pane) || !isAgentKind(agent) || !isSourcePath(transcript) || !isCursor(cursor)) {
        return bad('lane');
    }
    return {
        pane,
        agent,
        transcript,
        cursor,
        tail: textOrNullAt(raw, 'tail'),
        title: textOrNullAt(raw, 'title'),
        lastPrompt: textOrNullAt(raw, 'lastPrompt'),
        claudeRecap: textOrNullAt(raw, 'claudeRecap'),
    };
};

const listOf = (json: string, column: string): readonly unknown[] => {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : bad(column);
};

export const lanesOf = (json: string): readonly SessionCursor[] => listOf(json, 'lanes').map(sessionCursorOf);

const taskOf = (raw: unknown): RecapTask => {
    if (!isRow(raw) || !Array.isArray(raw.lanes)) {
        return bad('task');
    }
    const lanes = raw.lanes.map((pane: unknown) => (typeof pane === 'string' && isPaneId(pane) ? pane : bad('task lane')));
    return { id: textAt(raw, 'id'), name: textAt(raw, 'name'), lanes, sections: null, markdown: textAt(raw, 'markdown') };
};

export const tasksOf = (json: string): readonly RecapTask[] => listOf(json, 'tasks').map(taskOf);

export const tabIdOfScope = (raw: string): ScopeId => (isTabId(raw) ? raw : bad('tab'));

const isRunningFlag = (raw: boolean): raw is Running => typeof raw === 'boolean';

export const runningAt = (row: Row): Running => {
    const raw = numberAt(row, 'running');
    const flag = raw === 1;
    return (raw === 0 || raw === 1) && isRunningFlag(flag) ? flag : bad('running');
};

export const costAt = (row: Row): Usd => {
    const raw = numberAt(row, 'cost_usd');
    return isUsd(raw) ? raw : bad('cost_usd');
};

export const languageAt = (row: Row): Text => textAt(row, 'language');

export const backendAt = (row: Row): Text | null => textOrNullAt(row, 'backend');

export const errorAt = (row: Row): Text | null => textOrNullAt(row, 'error');

export const recapAtOf = (row: Row): Instant | null => instantOrNullAt(row, 'at');

export const factOf = (row: Row): Fact => {
    const id = stringAt(row, 'id');
    const section = oneOf(SECTION_NAMES, stringAt(row, 'section'), 'section');
    const state = stringAt(row, 'state');
    const closedWhy = row.closed_why === null ? null : oneOf(CLOSED_WHY, stringAt(row, 'closed_why'), 'closed_why');
    if (!isFactId(id)) {
        return bad('id');
    }
    return {
        id,
        task: { tab: tabIdOfScope(stringAt(row, 'tab')), key: textAt(row, 'task_key') },
        section,
        text: textAt(row, 'text'),
        why: textOrNullAt(row, 'why'),
        ref: textOrNullAt(row, 'ref'),
        agent: textOrNullAt(row, 'agent'),
        anchor: textOrNullAt(row, 'anchor'),
        firstAt: instantAt(row, 'first_at'),
        lastAt: instantAt(row, 'last_at'),
        state: state === 'open' || state === 'closed' ? state : bad('state'),
        closedWhy,
        closedAt: instantOrNullAt(row, 'closed_at'),
        language: textAt(row, 'language'),
    };
};

export const historyFactOf = (row: Row): HistoryFact => {
    const { section, text, why, state, closedWhy, closedAt, firstAt, lastAt } = factOf(row);
    return { section, text, why, state, closedWhy, closedAt, firstAt, lastAt };
};
