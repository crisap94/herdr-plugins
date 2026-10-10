import type { Fact, FactId } from '#src/recap/domain/fact.ts';

export function fact(id: string, section: Fact['section'], text: string, at: number, more: Partial<Fact> = {}): Fact {
    return { id: id as FactId, task: { tab: 'w1:t1', key: 't1' }, section, text, why: null, ref: null, agent: null, anchor: null, firstAt: at, lastAt: at, state: 'open', closedWhy: null, closedAt: null, language: 'en', ...more };
}
