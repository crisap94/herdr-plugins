import type { Fact, FactId } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import { tabIdOf } from '@stateforge-labs/session-ledger';

export function fact(id: string, section: Fact['section'], text: string, at: number, more: Partial<Fact> = {}): Fact {
    return { id: id as FactId, task: { scope: tabIdOf('w1:t1'), key: textOf('t1') }, section, text: textOf(text), why: null, ref: null, agent: null, anchor: null, firstAt: instant(at), lastAt: instant(at), state: 'open', closedWhy: null, closedAt: null, language: textOf('en'), ...more };
}
