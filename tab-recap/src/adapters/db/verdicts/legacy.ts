import type { Database } from 'bun:sqlite';
import { must } from '#src/protocol/result.ts';
import type { Disagreement, Pair, Verdict, Verdicts } from '#src/ports/verdicts.ts';
import { parseVerdictRecord, type DisagreementRecord, type VerdictRecord } from '#src/ports/verdicts.ts';
import { parseRunId } from '#src/recap/domain/run-ids.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { VerdictRowStore } from '../verdicts.ts';

const verdictOf = (record: VerdictRecord): Verdict => ({
    run: record.run, item: record.item, check: record.check, pass: record.pass === 'pass', critique: record.critique,
    judge: record.judge, at: record.at, source: record.source,
});

const disagreementOf = (record: DisagreementRecord): Disagreement => ({
    run: record.run, item: record.item, check: record.check, judge: record.judge === 'pass', operator: record.operator === 'pass',
    judgeCritique: record.judgeCritique, reason: record.reason, at: record.at,
});

export class VerdictsRepository implements Verdicts {
    private readonly store: VerdictRowStore;

    constructor(db: Database) {
        this.store = new VerdictRowStore(db);
    }

    add(rows: readonly Verdict[]): void {
        this.store.add(rows.map((verdict) => {
            if (parseRunId(verdict.run).kind === 'err') {
                throw new Error(`not a run id: ${verdict.run}`);
            }
            return must(parseVerdictRecord({ ...verdict, pass: verdict.pass ? 'pass' : 'fail' }));
        }));
    }

    ofRun(run: string): readonly Verdict[] {
        const id = parseRunId(run);
        return id.kind === 'ok' ? this.store.ofRun(id.value).map(verdictOf) : [];
    }

    labelled(check: string | null = null): ReadonlySet<string> {
        if (check === null) {
            return this.store.labelled(null);
        }
        const text = parseText(check);
        return text.kind === 'ok' ? this.store.labelled(text.value) : new Set<string>();
    }

    pairs(): readonly Pair[] {
        return this.store.pairs().map((pair) => ({ check: pair.check, judge: pair.judge === 'pass', operator: pair.operator === 'pass' }));
    }

    disagreements(): readonly Disagreement[] {
        return this.store.disagreements().map(disagreementOf);
    }
}
