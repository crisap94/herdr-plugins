import type { Fact, FactId } from '#src/recap/domain/fact.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';
import { tabIdOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/lane-shape.ts';

export function fact(id: string, section: Fact['section'], text: string, at: number, more: Partial<Fact> = {}): Fact {
    return { id: id as FactId, task: { tab: tabIdOf('w1:t1'), key: textOf('t1') }, section, text: textOf(text), why: null, ref: null, agent: null, anchor: null, firstAt: instant(at), lastAt: instant(at), state: 'open', closedWhy: null, closedAt: null, language: textOf('en'), ...more };
}
