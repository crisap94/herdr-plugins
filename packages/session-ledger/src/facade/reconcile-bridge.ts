import type { EnginePlugs, Stories } from '#src/contract/engine.ts';
import type { Fact, TaskId } from '#src/contract/facts.ts';
import type { ScopeId } from '#src/contract/ids.ts';
import type { Count, Instant, Text } from '#src/contract/kernel.ts';
import type { Curator } from '#src/contract/models.ts';
import type { RecapTask } from '#src/contract/records.ts';
import type { CheckedLedger, Ledger } from '#src/ports/ledger.ts';
import type { LaneCursor } from '#src/ports/recap-records.ts';
import type { Stories as LedgerStories } from '#src/ports/stories.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { UNREAD, type Entry } from '#src/ports/transcripts.ts';
import { isUnknown, saying, type Unknown } from '#src/ports/unknowable.ts';
import { RECONCILE_EVERY, Reconciling, type CurateWhy, type ReconcilingDeps, type RunEvent } from '#src/recap/application/ledger-reconcile.ts';
import { brand } from '#src/recap/domain/brand.ts';

const TAIL_BYTES = 256 * 1024;

const note = brand<string, 'Text'>;

const count = brand<number, 'Count'>;
const tabOf = brand<string, 'TabId'>;

export interface CurateBridge {
    readonly ledger: CheckedLedger;
    readonly readers: TranscriptRegistry;
}

export interface Round {
    readonly plugs: EnginePlugs;
    readonly curator: Curator;
    readonly stories: Stories;
    readonly scope: ScopeId;
    readonly task: RecapTask;
}

export type Reconciled = 'reconciled' | 'unchanged';

export type Owing = 'due' | 'waiting';

export interface Reconcile {
    task(round: Round, lanes: readonly LaneCursor[], why: CurateWhy): Promise<Reconciled>;
    due(event: RunEvent): Owing;
    settle(scope: ScopeId): void;
}

const byTime = (a: Entry, b: Entry): Count => count((a.at ?? 0) - (b.at ?? 0));

const tailOf = (readers: TranscriptRegistry) => async (lanes: readonly LaneCursor[]): Promise<readonly Entry[]> => {
    const read = await Promise.all(lanes.filter((seat) => seat.transcript !== '').map(async (seat) => {
        const reader = readers.readerFor(seat.agent);
        const chunk = reader === undefined ? null : await reader.read(seat.transcript, UNREAD, TAIL_BYTES);
        return chunk === null || isUnknown(chunk) ? [] : chunk.entries;
    }));
    return read.flat().toSorted(byTime);
};

const plainLedger = (ledger: CheckedLedger, log: (line: Text) => void): Ledger => {
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

export const reconcilingOver = (plugs: EnginePlugs, bridge: CurateBridge, stories: LedgerStories): Reconcile => {
    const { environment, settings, models } = plugs;
    const log = (line: Text): void => { environment.log(line); };
    const deps: ReconcilingDeps = {
        ledger: plainLedger(bridge.ledger, log),
        stories,
        writer: () => models.curator?.() ?? null,
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
        task: async (round: Round, lanes: readonly LaneCursor[], why: CurateWhy): Promise<Reconciled> => ((await reconciling.task(tabOf(round.scope), { id: note(round.task.id), name: note(round.task.name), lanes: round.task.lanes.map(note) }, lanes, why)) ? 'reconciled' : 'unchanged'),
        due: (event: RunEvent): Owing => (reconciling.due(event) ? 'due' : 'waiting'),
        settle: (scope: ScopeId): void => { reconciling.settle(tabOf(scope)); },
    };
};
