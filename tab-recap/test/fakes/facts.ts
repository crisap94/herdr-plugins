import type { Fact, FactId, RunId, Section, TaskId } from '#src/recap/domain/fact.ts';
import type { RunRef } from '#src/recap/domain/ops.ts';

export const TASK: TaskId = { tab: 'w1:t1', key: 't1' };

let counter = 0;

export const factOf = (section: Section, text: string, over: Partial<Fact> = {}): Fact => ({
    id: `fct_${(counter += 1)}` as FactId, task: TASK, section, text, why: section === 'decisions' ? 'because the plan says so' : null, ref: null, agent: null, anchor: null,
    firstAt: 1000, lastAt: 1000, state: 'open', closedWhy: null, closedAt: null, language: 'en', ...over,
});

export function runAt(at: number, over: Partial<RunRef> = {}): RunRef {
    let made = 0;
    return { id: 'run_1' as RunId, task: TASK, at, language: 'en', mint: (): FactId => `n${(made += 1)}` as FactId, ...over };
}
