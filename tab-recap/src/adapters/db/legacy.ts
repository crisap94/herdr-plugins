import type { Database } from 'bun:sqlite';
import type { AnswerTally, AutocompactRecords, CoverageAmendment, Decision, DecisionCounts, LastDecision, LinkedDecision, PaneKey, Skip, StoredDecision, StoredDecisionRow } from '#src/ports/autocompact-records.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { type CompactionId, type DecisionId, type PaneId, type TabId } from '#src/recap/domain/ids.ts';
import { parseProbability, type Probability } from '#src/recap/domain/probability.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { type Instant } from '#src/recap/domain/time.ts';
import type { Usd } from '#src/recap/domain/usd.ts';
import { DecisionLedgerRepository } from './autocompact-records.ts';

const textOf = (raw: string | null | undefined): Text | null => (raw === null || raw === undefined ? null : must(parseText(raw)));
const countOf = (raw: number | null | undefined): Count | null => (raw === null || raw === undefined ? null : must(parseCount(raw)));

const tallyOf = (record: Readonly<Record<string, number>>): AnswerTally =>
    new Map(Object.entries(record).flatMap(([key, value]): readonly (readonly [Text, Probability])[] => { const share = parseProbability(value); return share === null ? [] : [[must(parseText(key)), share]]; }));

const recordOfTally = (tally: AnswerTally): Readonly<Record<string, number>> => Object.fromEntries(tally);

const storedOf = (row: StoredDecisionRow): StoredDecision => ({ ...row, answers: recordOfTally(row.answers), coverage: row.coverage === null ? null : recordOfTally(row.coverage) });

export class AutocompactRecordsRepository implements AutocompactRecords {
    private readonly ledger: DecisionLedgerRepository;

    constructor(db: Database) {
        this.ledger = new DecisionLedgerRepository(db);
    }

    record(d: Decision): DecisionId {
        return this.ledger.record({
            ...d, share: must(parseCount(d.share)), tokens: must(parseCount(d.tokens)), window: must(parseCount(d.window)), answers: tallyOf(d.answers),
            coverage: d.coverage === null ? null : tallyOf(d.coverage), decider: textOf(d.decider), why: textOf(d.why),
        });
    }

    amend(id: DecisionId, update: CoverageAmendment): void {
        this.ledger.amend(id, { ...update, coverage: update.coverage === null ? null : tallyOf(update.coverage), why: textOf(update.why), block: update.block ? 'blocks' : 'allows' });
    }

    unlinkedCompactSince(tab: TabId, pane: PaneId, at: Instant): boolean { return this.ledger.unlinkedCompactSince(tab, pane, at) === 'unlinked'; }
    unlinkedCompactAny(at: Instant): boolean { return this.ledger.unlinkedCompactAny(at) === 'unlinked'; }
    skip(skip: Skip): void { this.ledger.skip({ ...skip, share: countOf(skip.share), detail: textOf(skip.detail) }); }
    newest(limit: Count, tab?: TabId): readonly StoredDecision[] { return this.ledger.newest(limit, tab).map(storedOf); }
    link(id: DecisionId, compactionId: CompactionId): void { this.ledger.link(id, compactionId); }
    linkLatest(tab: TabId, pane: PaneId, compactionId: CompactionId): LinkedDecision | null { return this.ledger.linkLatest(tab, pane, compactionId); }
    lastDecisionAt(tab: TabId, pane: PaneId): Instant | null { return this.ledger.lastDecisionAt(tab, pane); }
    lastDecision(tab: TabId, pane: PaneId): LastDecision | null { return this.ledger.lastDecision(tab, pane); }
    markRequested(id: DecisionId): void { this.ledger.markRequested(id); }
    pruneSkips(keep: readonly PaneKey[]): void { this.ledger.pruneSkips(keep); }
    skips(): readonly Skip[] { return this.ledger.skips(); }
    countsFor(tab: TabId): DecisionCounts { return this.ledger.countsFor(tab); }
    costSince(at: Instant): Usd { return this.ledger.costSince(at); }
}
