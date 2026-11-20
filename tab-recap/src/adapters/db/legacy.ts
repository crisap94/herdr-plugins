import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import type { Ask, AskIdentity, AskKey, AskLedger, NewAsk, Requester } from '#src/ports/ask-ledger.ts';
import type { AutocompactBriefs } from '#src/ports/autocompact-briefs.ts';
import type { AnswerTally, AutocompactRecords, CoverageAmendment, Decision, DecisionCounts, LastDecision, LinkedDecision, PaneKey, Skip, StoredDecision, StoredDecisionRow } from '#src/ports/autocompact-records.ts';
import type { Boundaries, BoundaryBreak, Break } from '#src/ports/boundaries.ts';
import type { ActiveStage, BeginCompaction, CompactionEnd, CompactionRecord, CompactionRecords, CompactionRow, StageFacts } from '#src/ports/compaction-records.ts';
import type { HandoffAnswerRow, HandoffAnswers } from '#src/ports/handoff-answers.ts';
import type { ImportedChapter } from '#src/ports/imported-recaps.ts';
import type { CheckAnchors } from '#src/ports/judge.ts';
import type { ExchangeName, RequestId } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { anchorsOf, withText } from '#src/recap/application/judge-anchors.ts';
import type { AskOutcome } from '#src/recap/domain/ask-outcome.ts';
import type { CheckedFact } from '#src/recap/domain/autocompact.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseFactIndex } from '#src/recap/domain/fact-index.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import type { StoredHandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import { agentKind, paneId, parseCompactionId, parseDecisionId, parsePaneId, parseTabId, tabId, type CompactionId, type DecisionId, type HandoffId, type PaneId, type TabId } from '#src/recap/domain/ids.ts';
import { parseProbability, type Probability } from '#src/recap/domain/probability.ts';
import type { ClosedLaneDays } from '#src/recap/domain/retention.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { duration, instant, type Instant } from '#src/recap/domain/time.ts';
import type { Usd } from '#src/recap/domain/usd.ts';
import type { AnswerRow, CompactRequest, CompactionQueue, HandoffRequestRow, NewHandoffRequest, Requests, Visibility, VisibilityRequest } from '#src/ports/requests.ts';
import { AskBookRepository } from './ask-ledger.ts';
import { DecisionBriefsRepository } from './autocompact-briefs.ts';
import { DecisionLedgerRepository } from './autocompact-records.ts';
import { BoundaryLogRepository } from './boundary-read.ts';
import { CompactionLogRepository } from './compaction-records.ts';
import { importedChaptersAt } from './imported-chapters.ts';
import { factsOfTabAt } from './imported.ts';
import { connectReadOnly } from './connection.ts';
import { openStoreAt, storeOver, type Store, type StoreSettings } from './database.ts';
import { HandoffAnswerRepository } from './handoff-answers.ts';
import type { NewerDatabase } from './open.ts';
import { RequestsStore } from './requests.ts';
import { RunInputsRepository } from './run-inputs/legacy.ts';
import { VerdictsRepository } from './verdicts/legacy.ts';

const textOf = (raw: string | null | undefined): Text | null => (raw === null || raw === undefined ? null : must(parseText(raw)));
const countOf = (raw: number | null | undefined): Count | null => (raw === null || raw === undefined ? null : must(parseCount(raw)));

export class AskLedgerRepository implements AskLedger {
    private readonly book: AskBookRepository;

    constructor(db: Database, log?: (line: Text) => void) {
        this.book = new AskBookRepository(db, log);
    }

    seen(exchange: ExchangeName, requester: Requester, id: RequestId): boolean {
        return this.book.seen(exchange, requester, id) === 'seen';
    }

    record(ask: NewAsk): void { this.book.record({ ...ask, at: instant(ask.at), ref: textOf(ask.ref) }); }
    attach(match: AskKey, ref: string): void { this.book.attach(match, must(parseText(ref))); }
    withdraw(identity: AskIdentity): void { this.book.withdraw(identity); }
    settle(match: AskKey, outcome: AskOutcome): void { this.book.settle(match, outcome); }
    unfinished(): readonly Ask[] { return this.book.unfinished(); }
    prune(before: number): void { this.book.prune(instant(before)); }
}

export class AutocompactBriefsRepository implements AutocompactBriefs {
    private readonly briefs: DecisionBriefsRepository;

    constructor(db: Database) {
        this.briefs = new DecisionBriefsRepository(db);
    }

    put(decisionId: string, brief: string, appended: readonly number[], checked: readonly CheckedFact[], briefedAt: number): void {
        const id = parseDecisionId(decisionId);
        const indexes = appended.flatMap((each) => { const index = parseFactIndex(each); return index.kind === 'ok' ? [index.value] : []; });
        if (id.kind === 'ok') this.briefs.put(id.value, must(parseText(brief)), indexes, checked, instant(briefedAt));
    }

    clearBefore(cutoff: number): number { return this.briefs.clearBefore(instant(cutoff)); }
}

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

const breakOf = ({ took, ...rest }: BoundaryBreak): Break => ({ ...rest, tookMs: took });

export class BoundaryRepository implements Boundaries {
    private readonly log: BoundaryLogRepository;

    constructor(db: Database) {
        this.log = new BoundaryLogRepository(db);
    }

    breaksOf(tab: string): readonly Break[] {
        const id = parseTabId(tab);
        return id.kind === 'ok' ? this.log.breaksOf(id.value).map(breakOf) : [];
    }

    chapterCount(tab: string): number { const id = parseTabId(tab); return id.kind === 'ok' ? this.log.chapterCount(id.value) : 0; }
    lastBreakAt(tab: TabId, pane: string): number | null { const id = parsePaneId(pane); return id.kind === 'ok' ? this.log.lastBreakAt(tab, id.value) : null; }
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

export class HandoffAnswersRepository implements HandoffAnswers {
    private readonly store: HandoffAnswerRepository;

    constructor(db: Database, now: () => number = Date.now) {
        this.store = new HandoffAnswerRepository(db, () => instant(now()));
    }

    answerHandoff(id: HandoffId, outcome: StoredHandoffOutcome): void { this.store.answerHandoff(id, outcome); }
    handoffAnswer(id: HandoffId): HandoffAnswerRow | null { return this.store.handoffAnswer(id); }
    prune(before: number): void { this.store.prune(instant(before)); }
}

export interface StoreOptions {
    readonly daemonVersion?: string | null;
    readonly now?: () => number;
    readonly log?: (line: string) => void;
    readonly closedDays?: ClosedLaneDays;
}

const settingsOf = (options: StoreOptions): StoreSettings => {
    const { now, daemonVersion, ...rest } = options;
    return { ...rest, ...(daemonVersion === undefined ? {} : { daemonVersion: textOf(daemonVersion) }), ...(now === undefined ? {} : { now: (): Instant => instant(now()) }) };
};

export const storeWith = (db: Database, options: StoreOptions = {}): Store => storeOver(db, settingsOf(options));

export const databasePath = (stateDir: string): FsPath => must(parseFsPath(join(stateDir, 'tab-recap.db')));

export function openStore(path: string, options: StoreOptions = {}): Store | NewerDatabase {
    return openStoreAt(must(parseFsPath(path)), settingsOf(options));
}

export const stateStore = (stateDir: string, options: StoreOptions = {}): Store | NewerDatabase => openStore(databasePath(stateDir), options);

export function operatorAnchors(path: string): CheckAnchors {
    if (!existsSync(path)) {
        return new Map();
    }
    const db = connectReadOnly(path);
    try {
        return anchorsOf(withText(new VerdictsRepository(db).disagreements(), new RunInputsRepository(db)));
    } catch {
        return new Map();
    } finally {
        db.close();
    }
}

export function importedChapters(path: string, tab: string): readonly ImportedChapter[] | null {
    const file = parseFsPath(path);
    const id = parseTabId(tab);
    return file.kind === 'err' || id.kind === 'err' ? null : importedChaptersAt(file.value, id.value);
}

export function factsOfTab(path: string, tab: string): readonly Fact[] | null {
    const file = parseFsPath(path);
    const id = parseTabId(tab);
    return file.kind === 'err' || id.kind === 'err' ? null : factsOfTabAt(file.value, id.value);
}

export class RequestsRepository implements Requests, CompactionQueue {
    private readonly store: RequestsStore;

    constructor(db: Database, now: () => number = Date.now) {
        this.store = new RequestsStore(db, () => instant(now()));
    }

    compactQueued(tab: TabId, pane: PaneId): boolean {
        return this.store.compactQueued(tab, pane) === 'queued';
    }

    request(tab: string): void {
        this.store.request(tabId(tab));
    }

    requestVisibility(request: VisibilityRequest): void {
        let visibility: Visibility = request.hidden ? 'hidden' : 'shown';
        if (request.hidden === 'toggle') visibility = 'toggle';
        this.store.requestVisibility({ target: paneId(request.target), visibility });
    }

    requestCompact(request: CompactRequest): void {
        this.store.requestCompact({
            tab: tabId(request.tab), pane: request.pane === null ? null : paneId(request.pane), note: request.note === null ? null : must(parseText(request.note)),
            ...(request.origin === undefined ? {} : { origin: request.origin }), ...(request.answer === undefined ? {} : { answer: must(parseText(request.answer)) }),
        });
    }

    requestCurate(tab: string): void {
        this.store.requestCurate(tabId(tab));
    }

    requestHandoff(request: NewHandoffRequest): HandoffId {
        return this.store.requestHandoff({
            tab: request.tab, pane: request.pane, toPane: request.toPane, note: request.note === null ? null : must(parseText(request.note)),
            refresh: request.refreshFirst ? 'refresh-first' : 'as-is', source: request.source, ...(request.answer === undefined ? {} : { answer: request.answer }),
        });
    }

    withdrawHandoff(id: HandoffId): boolean {
        return this.store.withdrawHandoff(id) === 'withdrawn';
    }

    takeHandoffs(): readonly HandoffRequestRow[] {
        const rows: HandoffRequestRow[] = [];
        for (const record of this.store.takeHandoffs()) rows.push({
            id: record.id, at: record.at, tab: record.tab, pane: record.pane, toPane: record.toPane, refreshFirst: record.refresh === 'refresh-first',
            note: record.note, source: record.source, ...(record.answer === undefined ? {} : { answer: record.answer }),
        });
        return rows;
    }

    takeRequests(): readonly TabId[] {
        return this.store.takeRequests();
    }

    takeVisibility(): readonly VisibilityRequest[] {
        return this.store.takeVisibility().map((ask) => ({ target: ask.target, hidden: ask.visibility === 'toggle' ? 'toggle' : ask.visibility === 'hidden' }));
    }

    takeCompactions(): readonly CompactRequest[] {
        return this.store.takeCompactions();
    }

    takeCurations(): readonly TabId[] {
        return this.store.takeCurations();
    }

    takeAnswered(): readonly AnswerRow[] {
        return this.store.takeAnswered();
    }
}
