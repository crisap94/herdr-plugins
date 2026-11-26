import type { EnginePlugs, Stories } from '#src/contract/engine.ts';
import type { Fact, TaskId } from '#src/contract/facts.ts';
import type { ScopeId } from '#src/contract/ids.ts';
import type { Count, Instant, Text } from '#src/contract/kernel.ts';
import type { Curator } from '#src/contract/models.ts';
import type { RecapTask } from '#src/contract/records.ts';
import type { Curators } from '#src/ports/curators.ts';
import type { CheckedLedger, FactStore } from '#src/ports/ledger.ts';
import type { SessionCursor } from '#src/ports/recap-records.ts';
import type { Stories as LedgerStories } from '#src/ports/stories.ts';
import { agentKindOf, type TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { sourcePathOf, UNREAD, type Entry } from '#src/ports/transcripts.ts';
import { isUnknown, saying, type Unknown } from '#src/ports/unknowable.ts';
import { RECONCILE_EVERY, Reconciling, type CurateWhy, type ReconcilingDeps, type RecapWritten } from '#src/recap/application/ledger-reconcile.ts';
import { brand } from '#src/recap/domain/brand.ts';

const TAIL_BYTES = 256 * 1024;

const note = brand<string, 'Text'>;

const count = brand<number, 'Count'>;
const tabOf = brand<string, 'ScopeId'>;
const paneOf = brand<string, 'SessionKey'>;

export interface CurateBridge {
    readonly ledger: CheckedLedger;
    readonly readers: TranscriptRegistry;
}

export interface Round {
    readonly plugs: EnginePlugs;
    readonly stories: Stories;
    readonly scope: ScopeId;
    readonly task: RecapTask;
}

export type Reconciled = 'reconciled' | 'unchanged';

export type Owing = 'due' | 'waiting';

export interface Reconcile {
    task(round: Round, lanes: readonly SessionCursor[], why: CurateWhy): Promise<Reconciled>;
    due(event: RecapWritten): Owing;
    settle(scope: ScopeId): void;
}

const byTime = (a: Entry, b: Entry): Count => count((a.at ?? 0) - (b.at ?? 0));

const tailOf = (readers: TranscriptRegistry) => async (lanes: readonly SessionCursor[]): Promise<readonly Entry[]> => {
    const read = await Promise.all(lanes.filter((seat) => seat.transcript !== '').map(async (seat) => {
        const reader = readers.readerFor(agentKindOf(seat.agent));
        const chunk = reader === undefined ? null : await reader.read(sourcePathOf(seat.transcript), UNREAD, count(TAIL_BYTES));
        return chunk === null || isUnknown(chunk) ? [] : chunk.entries;
    }));
    return read.length < 2 ? read.flat() : read.flat().toSorted(byTime);
};

const plainLedger = (ledger: CheckedLedger, log: (line: Text) => void): FactStore => {
    const skipped = (found: readonly Fact[] | Unknown): readonly Fact[] => {
        if ('kind' in found) {
            log(note(`curate: facts not read, ${saying(found.why)}`));
            return [];
        }
        return found;
    };
    return {
        ...ledger,
        openOf: (task: TaskId) => { const found = ledger.openOf(task); return 'kind' in found ? [] : found; },
        recentlyClosed: (task: TaskId, sinceMs: Instant) => { const found = ledger.recentlyClosed(task, sinceMs); return 'kind' in found ? [] : found; },
        allOf: (task: TaskId) => skipped(ledger.allOf(task)),
        keysOf: (scope: ScopeId): readonly Text[] => { const found = ledger.keysOf(scope); return 'kind' in found ? [] : found.map((key) => note(key)); },
    };
};

const curatorsOf = (curator: Curator | null): Curators | null =>
    curator === null ? null : { backend: note(curator.backend), write: (document, mode) => curator.write(document, mode) };

export const reconcilingOver = (plugs: EnginePlugs, bridge: CurateBridge, stories: LedgerStories): Reconcile => {
    const { environment, settings, models } = plugs;
    const log = (line: Text): void => { environment.log(line); };
    const deps: ReconcilingDeps = {
        ledger: plainLedger(bridge.ledger, log),
        stories,
        writer: (): Curators | null => curatorsOf(models.curator?.() ?? null),
        clock: () => environment.clock.now(),
        zone: (): Text => note(Intl.DateTimeFormat().resolvedOptions().timeZone),
        language: () => settings.language(),
        get rubric(): Text { return settings.rubric?.() ?? note(''); },
        tail: tailOf(bridge.readers),
        repair: () => settings.storyRepair?.() ?? 'off',
        every: (): Count => count(settings.reconcileEvery?.() ?? RECONCILE_EVERY),
        log: (line: Text): void => { log(line); },
    };
    const reconciling = new Reconciling(deps);
    return {
        task: async (round: Round, lanes: readonly SessionCursor[], why: CurateWhy): Promise<Reconciled> => ((await reconciling.task(tabOf(round.scope), { id: note(round.task.id), name: note(round.task.name), lanes: round.task.sessions.map(paneOf) }, lanes, why)) ? 'reconciled' : 'unchanged'),
        due: (event: RecapWritten): Owing => (reconciling.due(event) ? 'due' : 'waiting'),
        settle: (scope: ScopeId): void => { reconciling.settle(tabOf(scope)); },
    };
};
