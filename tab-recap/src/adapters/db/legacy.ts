import type { Database } from 'bun:sqlite';
import type { AnswerTally, AutocompactRecords, CoverageAmendment, Decision, DecisionCounts, LastDecision, LinkedDecision, PaneKey, Skip, StoredDecision, StoredDecisionRow } from '#src/ports/autocompact-records.ts';
import type { ActiveStage, BeginCompaction, CompactionEnd, CompactionRecord, CompactionRecords, CompactionRow, StageFacts } from '#src/ports/compaction-records.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { agentKind, paneId, parseCompactionId, parseTabId, tabId, type CompactionId, type DecisionId, type PaneId, type TabId } from '#src/recap/domain/ids.ts';
import { parseProbability, type Probability } from '#src/recap/domain/probability.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { duration, instant, type Instant } from '#src/recap/domain/time.ts';
import type { Usd } from '#src/recap/domain/usd.ts';
import { DecisionLedgerRepository } from './autocompact-records.ts';
import { CompactionLogRepository } from './compaction-records.ts';

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

const compactionRecordOf = ({ took, retry, queue, ...rest }: CompactionRow): CompactionRecord => ({ ...rest, tookMs: took, retried: retry === 'retried', queued: queue === 'queued' });

export class CompactionRecordsRepository implements CompactionRecords {
    private readonly log: CompactionLogRepository;

    constructor(db: Database) {
        this.log = new CompactionLogRepository(db);
    }

    begin(start: BeginCompaction): string {
        return this.log.begin({ ...start, tab: tabId(start.tab), pane: paneId(start.pane), agent: agentKind(start.agent), at: instant(start.at), writer: textOf(start.writer), why: textOf(start.why), answer: textOf(start.answer) });
    }

    advance(id: string, stage: ActiveStage, facts: StageFacts): void {
        const key = parseCompactionId(id);
        const queue = facts.queued === undefined ? {} : { queue: facts.queued ? 'queued' as const : 'direct' as const };
        if (key.kind === 'ok') this.log.advance(key.value, stage, { at: instant(facts.at), brief: facts.brief ?? null, writer: textOf(facts.writer), templateWhy: textOf(facts.templateWhy), ...queue });
    }

    finish(id: string, end: CompactionEnd): void {
        const key = parseCompactionId(id);
        const took = end.tookMs === null || end.tookMs === undefined ? null : duration(end.tookMs);
        if (key.kind === 'ok') {
            this.log.finish(key.value, { stage: end.stage, at: instant(end.at), tokensBefore: countOf(end.tokensBefore), tokensAfter: countOf(end.tokensAfter), took, retry: end.retried === true ? 'retried' : 'first-try', why: textOf(end.why) });
        }
    }

    dismissTurn(tab: string, pane: string, at: number): void { this.log.dismissTurn(tabId(tab), paneId(pane), instant(at)); }
    interrupted(at: number, why: string): number { return this.log.interrupted(instant(at), must(parseText(why))); }
    autoInProgress(): boolean { return this.log.autoInProgress() === 'auto-in-progress'; }
    shownFor(tab: string): readonly CompactionRecord[] { const id = parseTabId(tab); return id.kind === 'ok' ? this.log.shownFor(id.value).map(compactionRecordOf) : []; }
}
