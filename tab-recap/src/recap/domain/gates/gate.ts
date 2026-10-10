import type { Fact } from '../fact.ts';
import type { Operation } from '../ops.ts';

export interface GateContext {
    readonly now: number;
    readonly language: string;
    readonly agents: readonly string[];
    readonly shown: ReadonlyMap<string, Fact>;
    readonly open: readonly Fact[];
    readonly closedLately: readonly Fact[];
    readonly source: string;
}

export interface Finding {
    readonly at: number;
    readonly gate: string;
    readonly outcome: 'refuse' | 'flag';
    readonly reason: string;
}

export interface Gate {
    readonly id: string;
    check(ops: readonly Operation[], context: GateContext): readonly Finding[];
}

export function docIdOf(fact: Fact, shown: ReadonlyMap<string, Fact>): string | null {
    return [...shown].find(([, each]) => each.id === fact.id)?.[0] ?? null;
}
