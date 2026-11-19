import type { RunId } from '#src/recap/domain/fact.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { Disagreement, Pair, Verdict } from './twins/verdicts/legacy.ts';

export type { Disagreement, Pair, Verdict, VerdictSource } from './twins/verdicts/legacy.ts';

export type Outcome = 'pass' | 'fail';

export interface VerdictRecord {
    readonly run: RunId;
    readonly item: Text | null;
    readonly check: Text;
    readonly pass: Outcome;
    readonly critique: Text | null;
    readonly judge: Text;
    readonly at: Instant;
    readonly source: 'judge' | 'operator';
}

export interface PairRecord {
    readonly check: Text;
    readonly judge: Outcome;
    readonly operator: Outcome;
}

export interface DisagreementRecord {
    readonly run: RunId;
    readonly item: Text;
    readonly check: Text;
    readonly judge: Outcome;
    readonly operator: Outcome;
    readonly judgeCritique: Text | null;
    readonly reason: Text | null;
    readonly at: Instant;
}

export interface Verdicts {
    add(verdicts: readonly Verdict[]): void;
    ofRun(run: RunId): readonly Verdict[];
    labelled(check?: Text | null): ReadonlySet<Text>;
    pairs(): readonly Pair[];
    disagreements(): readonly Disagreement[];
}
