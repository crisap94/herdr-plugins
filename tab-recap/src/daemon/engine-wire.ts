import { parseRestoreText, type Engine, type LedgerEvent, type RestoreText } from '@stateforge-labs/session-ledger';
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
import type { Pacing } from '#src/recap/domain/pacing.ts';
import { viewersOf, visibleOf, type Viewers } from './view/viewers.ts';
import type { WriterView } from '#src/recap/domain/writer-view.ts';
import { lanesOf, type Board } from '#src/recap/domain/board.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import type { Backends } from './backends.ts';
import { loadSettings } from './config.ts';
import { parseLine, parseMessage } from './slots.ts';
import { brand, type Brand } from '#src/recap/domain/brand.ts';
import { checkedLedger, checkedRecords } from '#src/ports/guarded-reads.ts';
import { restoreTextOf } from '#src/recap/application/restore-text.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

type EngineLog = Parameters<typeof pluginEngine>[0]['environment']['log'];
type EngineRepos = Parameters<typeof pluginEngine>[0]['environment']['repos'];
type KeepInput = Brand<boolean, 'KeepInput'>;

function parseRecapLanguage(): Text {
    return must(parseText(loadSettings().recapLanguage));
}

function parseKeepInput(): KeepInput {
    return brand<boolean, 'KeepInput'>(loadSettings().keepInputDays > 0);
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
            pipeline: (): Pipeline => loadSettings().pipeline,
            closeEvidence: (): CloseEvidence => loadSettings().writerCloseEvidence,
            writerView: (): WriterView => loadSettings().writerView,
            debounce: (): Debounce => loadSettings().recapDebounce,
            pacing: (): Pacing => loadSettings().pacing,
            visible: visibleOf(board, viewers),
        },
        restore: {
            bytes: (): undefined => undefined,
            render: (facts): RestoreText => must(parseRestoreText(restoreTextOf(facts))),
        },
        on: (event): void => {
            if (event.kind === 'recap-written') {
                ranRun(curate, events, board, { tab: tabId(event.scope), turns: event.turns, boundary: event.boundary, ...(event.cause === undefined ? {} : { cause: must(parseText(event.cause)) }) }, log);
            }
            ledger(event);
        },
    });
    return { engine, recaps: tabRecaps(engine), viewers };
}
