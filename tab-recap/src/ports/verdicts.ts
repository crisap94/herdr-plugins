export type VerdictSource = 'judge' | 'operator';

/** One answer about one check of one item (or of the whole run: `item` null). */
export interface Verdict {
    /** the run's TypeID */
    readonly run: string;
    readonly item: string | null;
    /** `I1`…`I7`, `S-<section>`, `coverage`, `filler`, `readback-<n>` */
    readonly check: string;
    readonly pass: boolean;
    readonly critique: string | null;
    /** `claude · sonnet · medium`, or who the operator is */
    readonly judge: string;
    readonly at: number;
    readonly source: VerdictSource;
}

/** The judge's and the operator's verdict on the same item and check. */
export interface Pair {
    readonly check: string;
    readonly judge: boolean;
    readonly operator: boolean;
}

/** An item on which the judge's newest verdict and the operator's differ for a check. */
export interface Disagreement {
    /** the run's TypeID */
    readonly run: string;
    readonly item: string;
    readonly check: string;
    readonly judge: boolean;
    readonly operator: boolean;
    readonly judgeCritique: string | null;
    /** the operator's reason, when they gave one */
    readonly reason: string | null;
    /** when the operator ruled (epoch ms) */
    readonly at: number;
}

export interface Verdicts {
    /** all in one transaction */
    add(verdicts: readonly Verdict[]): void;
    ofRun(run: string): readonly Verdict[];
    /** `<run>|<item>` of every item the operator has labelled (for `check` only, when one is named) */
    labelled(check?: string | null): ReadonlySet<string>;
    /** the newest judge verdict and the newest operator verdict of each item and check that has both */
    pairs(): readonly Pair[];
    /** the items the judge and the operator disagree on, the operator's newest ruling first */
    disagreements(): readonly Disagreement[];
}
