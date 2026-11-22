import type { Fact, FactId, RunId, Section, TaskId } from '#src/recap/domain/fact.ts';
import type { RunRef } from '#src/recap/domain/ops.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';
import { tabIdOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/lane-shape.ts';

export const TASK: TaskId = { tab: tabIdOf('w1:t1'), key: textOf('t1') };

let counter = 0;

export const factOf = (section: Section, text: string, over: Partial<Fact> = {}): Fact => ({
    id: `fct_${(counter += 1)}` as FactId, task: TASK, section, text: textOf(text), why: section === 'decisions' ? textOf('because the plan says so') : null, ref: null, agent: null, anchor: null,
    firstAt: instant(1000), lastAt: instant(1000), state: 'open', closedWhy: null, closedAt: null, language: textOf('en'), ...over,
});

export function runAt(at: number, over: Partial<RunRef> = {}): RunRef {
    let made = 0;
    return { id: 'run_1' as RunId, task: TASK, at: instant(at), language: textOf('en'), mint: (): FactId => `n${(made += 1)}` as FactId, ...over };
}
