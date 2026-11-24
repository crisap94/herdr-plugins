import { instant, type Fact, type FactId, type HistoryFact, type Recap, type RunId, type ScopeId, type TaskId } from '@stateforge-labs/session-ledger';
import { running, text as textOf, usd } from './values.ts';
import { tabIdOf } from '../src/recap/domain/lane-shape.ts';

const isFactId = (text: string): text is FactId => typeof text === 'string';

const isRunId = (text: string): text is RunId => typeof text === 'string';

export const factIdOf = (text: string): FactId => {
    if (isFactId(text)) {
        return text;
    }
    throw new Error('testkit: a fact id is a string');
};

export const runIdOf = (text: string): RunId => {
    if (isRunId(text)) {
        return text;
    }
    throw new Error('testkit: a run id is a string');
};

export const factOf = (id: string, over: Partial<Omit<Fact, 'id'>> = {}): Fact => ({
    id: factIdOf(id),
    task: { scope: tabIdOf('tab-1'), key: textOf('a') },
    section: 'now',
    text: textOf(''),
    why: null,
    ref: null,
    agent: null,
    anchor: null,
    firstAt: instant(0),
    lastAt: instant(0),
    state: 'open',
    closedWhy: null,
    closedAt: null,
    language: textOf('en'),
    ...over,
});

export const sameTask = (left: TaskId, right: TaskId): boolean => left.scope === right.scope && left.key === right.key;

export const historyOf = ({ section, text, why, state, closedWhy, closedAt, firstAt, lastAt }: Fact): HistoryFact => ({
    section,
    text: textOf(text),
    why: why === null ? null : textOf(why),
    state,
    closedWhy,
    closedAt: closedAt === null ? null : closedAt,
    firstAt: firstAt,
    lastAt: lastAt,
});

export const emptyRecap = (tab: ScopeId): Recap => ({
    scope: tab, sessions: [], tasks: [], at: null, running: running(false), backend: null, error: null, costUsd: usd(0), language: textOf(''),
});
