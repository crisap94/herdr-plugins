import type * as sl from './contract-names.ts';
import { parseHarnessKind, parseScopeId, parseSessionKey, type RestoreText } from '#src/contract/ids.ts';
import { must } from '#src/protocol/result.ts';
import { brand } from '#src/recap/domain/brand.ts';
import { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import type { CheckedLedger } from '#src/ports/ledger.ts';
import type { CheckedRecapRecords, RecordedRun, FailedRun, Advance, TabRecap, LastRun } from '#src/ports/recap-records.ts';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import { UNREAD, type Transcripts, type Located, type ChunkResult, type PromptResult } from '#src/ports/transcripts.ts';
import type { Clock } from '#src/ports/clock.ts';
import type { LaneRepo, RepoResult } from '#src/ports/lane-repo.ts';
import type { Unknown, Unknowable } from '#src/ports/unknowable.ts';
import type { Fact, FactId, Section } from '#src/recap/domain/fact.ts';
import type { Operation, Refusal } from '#src/recap/domain/ops.ts';
import type { Lane, TabId } from '#src/recap/domain/lane-shape.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { parseDuration, parseInstant, type Duration } from '#src/recap/domain/time.ts';
import { parseFailureCause, type FailureCause } from '#src/recap/domain/failure-cause.ts';
import { FULL_WRITER_VIEW, keepNewestOf, nextHoursOf, prunedWriterView, type HiddenCounts, type PositiveCount, type WriterView } from '#src/recap/domain/writer-view.ts';
import type { Debounce } from '#src/recap/domain/debounce.ts';
import { PACING_TURN, type Pacing } from '#src/recap/domain/pacing.ts';
import type { EnginePlugs as LegacyPlugs, RestoreFacts as LegacyRestoreFacts } from '#src/recap/application/engine.ts';
import { curate } from './curate.ts';
import { followedOf } from './translate.ts';

export interface RestoreHooks {
    readonly bytes: () => number | undefined;
    readonly render: (facts: LegacyRestoreFacts) => RestoreText | undefined;
}

export interface FacadePlugs extends Omit<LegacyPlugs, 'ran'> {
    on?(event: sl.LedgerEvent): void;
    restore?: RestoreHooks;
    curate?(scope: sl.ScopeId): Promise<void>;
}

const isLedgerFactId = (id: FactId): id is FactId & sl.FactId => id !== '';
const isPluginFactId = (id: sl.FactId): id is sl.FactId & FactId => id !== '';
const isLedgerText = (text: Text): text is Text & sl.Text => text.length >= 0;
const isLedgerCount = (count: PositiveCount): count is PositiveCount & sl.PositiveCount => Number.isSafeInteger(count) && count >= 1;

const bridged = <F, T extends F>(value: F, fits: (value: F) => value is T, what: string): T => {
    if (fits(value)) {
        return value;
    }
    throw new Error(`conformance subject: ${what} does not cross the boundary`);
};

const ledgerFactId = (id: FactId): sl.FactId => bridged(id, isLedgerFactId, 'a fact id');
const pluginFactId = (id: sl.FactId): FactId => bridged(id, isPluginFactId, 'a fact id');
const pluginFact = (fact: sl.Fact): Fact => ({ ...fact, id: pluginFactId(fact.id) });
const ledgerFact = (fact: Fact): sl.Fact => ({ ...fact, id: ledgerFactId(fact.id) });

const ledgerOperation = (op: Operation): sl.Operation => {
    if (op.op !== 'close' || op.anchor === undefined) {
        return op.op === 'close' ? { op: 'close', id: op.id, why: op.why } : op;
    }
    return { ...op, anchor: bridged(op.anchor, isLedgerText, 'an anchor') };
};

const ledgerRefusal = (refusal: Refusal): sl.Refusal => ({ op: ledgerOperation(refusal.op), reason: refusal.reason });

const ledgerRecorded = (run: RecordedRun): sl.RecordedRun => ({ ...run, changed: run.changed.map(ledgerFact), refused: run.refused.map(ledgerRefusal) });

const durationOf = (after: sl.Duration): Duration => must(parseDuration(after));
const causeOf = (detail: string): FailureCause => parseFailureCause(must(parseText(detail)));

const pluginUnknowable = (why: sl.Unknowable): Unknowable => {
    switch (why.why) {
        case 'timeout':
            return { why: 'timeout', after: durationOf(why.after) };
        case 'lease':
            return { why: 'lease', after: durationOf(why.after) };
        case 'unreadable':
            return { why: 'unreadable', detail: causeOf(why.detail) };
        case 'unreachable':
            return { why: 'unreachable', detail: causeOf(why.detail) };
        case 'failed':
            return { why: 'failed', code: why.code, detail: causeOf(why.detail) };
        case 'not-found':
            return { why: 'not-found', what: why.what };
        default: {
            const exhaustive: never = why;
            return exhaustive;
        }
    }
};
const pluginUnknown = (value: sl.Unknown): Unknown => ({ kind: 'unknown', why: pluginUnknowable(value.why) });

const isLedgerUnknown = (value: unknown): value is sl.Unknown => typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'unknown';

const orFallback = <T>(value: T | sl.Unknown, fallback: T): T => (isLedgerUnknown(value) ? fallback : value);
const orNull = <T>(value: T | null | sl.Unknown): T | null => orFallback<T | null>(value, null);
const orEmpty = <T>(value: readonly T[] | sl.Unknown): readonly T[] => orFallback<readonly T[]>(value, []);

const scopeOf = (tab: string): sl.ScopeId => must(parseScopeId(tab));
const keyOf = (pane: string): sl.SessionKey => must(parseSessionKey(pane));

const pluginRecords = (records: sl.Records): CheckedRecapRecords => ({
    readRecap: (tab: string): TabRecap | null | Unknown => {
        const found = records.readRecap(scopeOf(tab));
        return isLedgerUnknown(found) ? pluginUnknown(found) : found;
    },
    lastRunOf: (tab: string): LastRun | null => orNull(records.lastRunOf(scopeOf(tab))),
    beginRun: (tab: string, backend: string | null, at: number): void => {
        records.beginRun(scopeOf(tab), backend, at);
    },
    recordRun: (run: RecordedRun): void => {
        records.recordRun(ledgerRecorded(run));
    },
    failRun: (run: FailedRun): void => {
        records.failRun(run);
    },
    advance: (move: Advance): void => {
        records.advance(move);
    },
});

const passedUnknown = <S, T>(value: S | sl.Unknown, convert: (each: S) => T): T | Unknown => (isLedgerUnknown(value) ? pluginUnknown(value) : convert(value));

const pluginLedger = (facts: sl.FactStore): CheckedLedger => ({
    openOf: (task) => passedUnknown(facts.openOf(task), (open) => open.map(pluginFact)),
    recentlyClosed: (task, sinceMs) => passedUnknown(facts.recentlyClosed(task, sinceMs), (closed) => closed.map(pluginFact)),
    allOf: (task) => orEmpty(facts.allOf(task)).map(pluginFact),
    keysOf: (tab) => { const found = facts.keysOf(scopeOf(tab)); return isLedgerUnknown(found) ? pluginUnknown(found) : found.map((key) => must(parseText(key))); },
    historyOf: (tab, pane) => facts.historyOf(scopeOf(tab), keyOf(pane)),
});


const ledgerHidden = (hidden: HiddenCounts): sl.HiddenCounts =>
    new Map([...hidden].map(([section, count]): [Section, sl.PositiveCount] => [section, bridged(count, isLedgerCount, 'a hidden count')]));

const ledgerRequest = (request: RecapRequest): sl.RecapRequest => {
    const { retry, input, ...rest } = request;
    const ledgerInput: sl.RecapInput = {
        ...input,
        ledgers: input.ledgers.map((entry) => (entry.hidden === undefined ? { task: entry.task, facts: entry.facts } : { task: entry.task, facts: entry.facts, hidden: ledgerHidden(entry.hidden) })),
    };
    if (retry === undefined) {
        return { ...rest, input: ledgerInput };
    }
    const refused = retry.refused.map((each) => ({ ...each, operation: ledgerOperation(each.operation) }));
    return { ...rest, input: ledgerInput, retry: { ...retry, refused } };
};

const pluginWritten = (written: sl.Written): Written => (written.kind === 'written' ? written : pluginUnknown(written));

const pluginSummarizer = (writer: sl.Writer): Summarizer => ({
    backend: writer.backend,
    contract: writer.contract,
    write: async (request: RecapRequest): Promise<Written> => pluginWritten(await writer.write(ledgerRequest(request))),
});

const pluginLocated = (located: sl.Located): Located => (located.kind === 'located' ? located : pluginUnknown(located));
const pluginChunk = (chunk: sl.Chunk | sl.Unknown): ChunkResult => (chunk.kind === 'chunk' ? chunk : pluginUnknown(chunk));

const transcriptsOf = (reader: sl.SessionReader): Transcripts => ({
    agent: reader.harness,
    inFlight: { kind: 'unsupported', why: 'in-flight-unavailable' },
    locate: async (lane: Lane): Promise<Located> => {
        const session = followedOf(lane);
        if (session === null) {
            return { kind: 'unknown', why: { why: 'not-found', what: `a followed session for ${lane.pane}` } };
        }
        return pluginLocated(await reader.locate(session));
    },
    read: async (source, was, budget) => pluginChunk(await reader.read(source, was, budget)),
    carry: (from, to, at) => (reader.carry === undefined || from.kind !== 'located' || to.kind !== 'located' ? Promise.resolve(UNREAD) : reader.carry(from, to, at)),
    latestPrompt: (): Promise<PromptResult> => Promise.resolve({ kind: 'prompt', text: null }),
});

class SessionRegistry extends TranscriptRegistry {
    private readonly sessions: sl.SessionSource;

    constructor(sessions: sl.SessionSource) {
        super({}, null, (kind: string) => {
            const harness = parseHarnessKind(kind);
            return harness.kind === 'ok' ? sessions.unavailableReason(harness.value) : `no reader for ${kind}`;
        });
        this.sessions = sessions;
    }

    override exact(kind: string): Transcripts | undefined {
        const harness = parseHarnessKind(kind);
        const reader = harness.kind === 'ok' ? this.sessions.readerFor(harness.value) : undefined;
        return reader === undefined ? undefined : transcriptsOf(reader);
    }

    override readerFor(kind: string): Transcripts | undefined {
        return this.exact(kind);
    }
}

const pluginClock = (clock: sl.Clock): Clock => ({ now: () => must(parseInstant(clock.now())) });

const pluginRepo = (result: sl.RepoResult): RepoResult => (result.kind === 'repo' || result.kind === 'no-repo' ? result : pluginUnknown(result));

const pluginRepos = (workplaces: sl.Workplaces): LaneRepo => ({
    repoOf: async (cwd: string): Promise<RepoResult> => pluginRepo(await workplaces.repoOf(cwd)),
});

const pluginWriterView = (view: sl.WriterView): WriterView =>
    view.kind === 'full' ? FULL_WRITER_VIEW : prunedWriterView(keepNewestOf(view.keepNewest), nextHoursOf(view.nextHours));

const pluginDebounce = (debounce: sl.Debounce): Debounce => (debounce.kind === 'off' ? debounce : { kind: 'window', window: durationOf(debounce.window) });

const pluginPacing = (pacing: sl.Pacing): Pacing => (pacing.kind === 'turn' ? PACING_TURN : { kind: 'smart', quiet: durationOf(pacing.quiet), maxWait: durationOf(pacing.maxWait) });

export const legacyPlugsOf = (plugs: sl.EnginePlugs): FacadePlugs => {
    const { settings } = plugs;
    return {
        source: { transcripts: new SessionRegistry(plugs.source.sessions) },
        store: { records: pluginRecords(plugs.store.records), ledger: pluginLedger(plugs.store.facts) },
        models: { summarizer: () => pluginSummarizer(plugs.models.writer()) },
        environment: {
            clock: pluginClock(plugs.environment.clock),
            repos: pluginRepos(plugs.environment.workplaces),
            mint: (): FactId => brand<string, 'FactId'>(plugs.environment.ids.next()),
            log: (line: string) => {
                plugs.environment.log(line);
            },
        },
        settings: {
            language: () => settings.language(),
            writerView: () => pluginWriterView(settings.writerView()),
            ...(settings.keepInput === undefined ? {} : { keepInput: () => settings.keepInput?.() === true }),
            ...(settings.pipeline === undefined ? {} : { pipeline: () => settings.pipeline?.() ?? 'one' }),
            ...(settings.debounce === undefined ? {} : { debounce: () => pluginDebounce(settings.debounce?.() ?? { kind: 'off' }) }),
            ...(settings.pacing === undefined ? {} : { pacing: () => pluginPacing(settings.pacing?.() ?? { kind: 'turn' }) }),
            ...(settings.visible === undefined ? {} : { visible: (id: TabId) => settings.visible?.(must(parseScopeId(String(id)))) ?? 'shown' }),
        },
        curate: curate(plugs),
        restore: {
            bytes: () => settings.restoreBytes?.(),
            render: (facts: LegacyRestoreFacts) => settings.restoreText?.({
                open: facts.open.map(ledgerFact),
                closed: facts.closed.map(ledgerFact),
            }),
        },
        ...(plugs.on === undefined
            ? {}
            : {
                  on: (event: sl.LedgerEvent) => {
                      plugs.on?.(event);
                  },
              }),
    };
};

