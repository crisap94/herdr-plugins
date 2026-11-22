import type { Count } from '#src/contract/kernel.ts';
import type { Fact } from '../fact.ts';
import type { Operation } from '../ops.ts';
import type { Text } from '../text.ts';
import type { Instant } from '../time.ts';
import type { GateId } from './item-gate.ts';

export type LedgerGateId = 'G2' | 'G6' | 'G10' | 'G11' | 'G12' | 'G13' | 'ITEM' | 'K' | 'L';

export interface GateContext {
    readonly now: Instant;
    readonly language: Text;
    readonly agents: readonly Text[];
    readonly shown: ReadonlyMap<Text, Fact>;
    readonly open: readonly Fact[];
    readonly closedLately: readonly Fact[];
    readonly source: Text;
}

export interface Finding {
    readonly at: Count;
    readonly gate: GateId | LedgerGateId;
    readonly outcome: 'refuse' | 'flag';
    readonly reason: Text;
}

export interface Gate {
    readonly id: LedgerGateId;
    check(ops: readonly Operation[], context: GateContext): readonly Finding[];
}

export function docIdOf(fact: Fact, shown: ReadonlyMap<Text, Fact>): Text | null {
    return [...shown].find(([, each]) => each.id === fact.id)?.[0] ?? null;
}
