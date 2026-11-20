import type { Engine, LedgerEvent } from '@stateforge-labs/session-ledger';
import { pluginEngine } from '#src/engine/engine-adapter.ts';
import { tabRecaps, type TabRecaps } from '#src/engine/tab-recaps.ts';
import type { RunEvent } from '#src/recap/application/ledger-reconcile.ts';
import { recapWritten, type EventStream } from '#src/recap/application/lane-events.ts';
import type { Curate } from '#src/recap/application/curate.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { mintFactId } from '#src/adapters/db/ledger-rows.ts';
import type { Clock } from '#src/ports/clock.ts';
import type { Enumerators } from '#src/ports/enumerators.ts';
import type { Summarizer } from '#src/ports/summarizer.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import type { CloseEvidence, Pipeline } from '#src/recap/domain/pipeline.ts';
import type { Debounce } from '#src/recap/domain/debounce.ts';
import type { Pacing, Shown } from '#src/recap/domain/pacing.ts';
import { viewersOf, type Viewers } from './view/viewers.ts';
import type { WriterView } from '#src/recap/domain/writer-view.ts';
import { lanesOf, type Board } from '#src/recap/domain/board.ts';
import { tabId, type TabId } from '#src/recap/domain/ids.ts';
import type { Backends } from './backends.ts';
import { loadConfig } from './config.ts';
import { parseLine, parseMessage } from './slots.ts';
import { brand, type Brand } from '#src/recap/domain/brand.ts';
import { checkedLedger, checkedRecords } from '#src/ports/guarded-reads.ts';

type EngineLog = Parameters<typeof pluginEngine>[0]['environment']['log'];
type EngineRepos = Parameters<typeof pluginEngine>[0]['environment']['repos'];
type RecapLanguage = Brand<string, 'RecapLanguage'>;
type KeepInput = Brand<boolean, 'KeepInput'>;

function parseRecapLanguage(): RecapLanguage {
    return brand<string, 'RecapLanguage'>(loadConfig().recapLanguage);
}

function parseKeepInput(): KeepInput {
    return brand<boolean, 'KeepInput'>(loadConfig().keepInputDays > 0);
}

export interface EngineParts {
    readonly store: Store;
    readonly backends: Backends;
    readonly transcripts: TranscriptRegistry;
    readonly clock: Clock;
    readonly repos: EngineRepos;
    readonly curate: Curate;
    readonly events: EventStream;
    readonly board: () => Board;
    readonly ledger: (event: LedgerEvent) => void;
    readonly log: EngineLog;
}

export interface WiredEngine {
    readonly engine: Engine;
    readonly recaps: TabRecaps;
    readonly viewers: Viewers;
}

async function runCurator(curate: Curate, event: RunEvent, say: EngineLog): Promise<void> {
    try {
        await curate.afterRun(event);
    } catch (error) {
        say(parseLine(`curator ${event.tab}: ${parseMessage(error)}`));
    }
}

function ranRun(curate: Curate, events: EventStream, board: () => Board, event: RunEvent, say: EngineLog): void {
    void runCurator(curate, event, say);
    recapWritten(events, lanesOf(board(), tabId(event.tab)), event.cause);
}

export function wireEngine({ store, backends, transcripts, clock, repos, curate, events, board, ledger, log }: EngineParts): WiredEngine {
    const viewers = viewersOf();
    const engine = pluginEngine({
        source: { transcripts },
        store: { records: checkedRecords(store.records), ledger: checkedLedger(store.ledger) },
        environment: { clock, log, repos, mint: mintFactId },
        models: { summarizer: (): Summarizer => backends.summarizer(), enumerator: (): Enumerators | null => backends.enumerator() },
        settings: {
            language: parseRecapLanguage,
            keepInput: parseKeepInput,
            pipeline: (): Pipeline => loadConfig().pipeline,
            closeEvidence: (): CloseEvidence => loadConfig().writerCloseEvidence,
            writerView: (): WriterView => loadConfig().writerView,
            debounce: (): Debounce => loadConfig().recapDebounce,
            pacing: (): Pacing => loadConfig().pacing,
            visible: (tab: TabId): Shown => (board().focused === tab ? 'shown' : viewers.watching(tab)),
        },
        on: (event): void => {
            if (event.kind === 'recap-written') {
                ranRun(curate, events, board, { tab: event.scope, turns: event.turns, boundary: event.boundary, ...(event.cause === undefined ? {} : { cause: event.cause }) }, log);
            }
            ledger(event);
        },
    });
    return { engine, recaps: tabRecaps(engine), viewers };
}
