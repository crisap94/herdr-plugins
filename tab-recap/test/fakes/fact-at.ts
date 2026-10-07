// A fact of task `t1` of tab `w1:t1` with sensible defaults, for tests of the expanded view and the curator.
import type { Fact, FactId } from '#src/recap/domain/fact.ts';

/** `more` overrides any field (`task` among them); `at` is the fact's first and last time. */
export function fact(id: string, section: Fact['section'], text: string, at: number, more: Partial<Fact> = {}): Fact {
    return { id: id as FactId, task: { tab: 'w1:t1', key: 't1' }, section, text, why: null, ref: null, agent: null, firstAt: at, lastAt: at, state: 'open', closedWhy: null, closedAt: null, language: 'en', ...more };
}
