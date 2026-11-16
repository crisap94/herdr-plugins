import type { Fact, FactId, RunId } from '@stateforge-labs/session-ledger';

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
    task: { tab: 'tab-1', key: 'a' },
    section: 'now',
    text: '',
    why: null,
    ref: null,
    agent: null,
    anchor: null,
    firstAt: 0,
    lastAt: 0,
    state: 'open',
    closedWhy: null,
    closedAt: null,
    language: 'en',
    ...over,
});
