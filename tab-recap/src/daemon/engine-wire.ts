import { parseRestoreText, type Engine, type LedgerEvent, type RestoreText } from '@stateforge-labs/session-ledger';
import { pluginEngine } from '#src/engine/engine-adapter.ts';
import { tabRecaps, type TabRecaps } from '#src/engine/tab-recaps.ts';
import type { LegacyRecapWritten as RecapWritten } from '@stateforge-labs/session-ledger';
import { recapWritten, type EventStream } from '#src/recap/application/lane-events.ts';
import type { Curating } from '@stateforge-labs/session-ledger';
import type { Store } from '#src/adapters/db/database.ts';
import { mintFactId } from '#src/adapters/db/ledger-rows.ts';
import type { Clock } from '@stateforge-labs/session-ledger';
import type { LegacyEnumerator as Enumerator } from '@stateforge-labs/session-ledger';
import type { LegacyWriter as Writer } from '@stateforge-labs/session-ledger';
import type { TranscriptRegistry } from '@stateforge-labs/session-ledger';
import type { CloseEvidence, Pipeline } from '@stateforge-labs/session-ledger';
import type { Debounce } from '@stateforge-labs/session-ledger';
import type { Pacing } from '@stateforge-labs/session-ledger';
import { viewersOf, visibleOf, type Viewers } from './view/viewers.ts';
import type { WriterView } from '@stateforge-labs/session-ledger';
import { lanesOf, type Board } from '#src/recap/domain/board.ts';
import { parseTabId } from '#src/recap/domain/ids.ts';
import type { Backends } from './backends.ts';
import { loadSettings } from './config.ts';
import { brand, type Brand } from '@stateforge-labs/session-ledger';
import { checkedLedger, checkedRecords } from '#src/ports/guarded-reads.ts';
import { restoreTextOf } from '#src/recap/application/restore-text.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';

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
    readonly backends: Pick<Backends, 'summarizer' | 'enumerator'>;
    readonly transcripts: TranscriptRegistry;
    readonly clock: Clock;
    readonly repos: EngineRepos;
    readonly curation: Curating;
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

function ranRun(events: EventStream, board: () => Board, event: RecapWritten): void {
    recapWritten(events, lanesOf(board(), event.scope), event.cause);
}

export function wireEngine({ store, backends, transcripts, clock, repos, curation, events, board, ledger, log }: EngineParts): WiredEngine {
    const viewers = viewersOf();
    const engine = pluginEngine({
        source: { transcripts },
        store: { records: checkedRecords(store.records), ledger: checkedLedger(store.ledger) },
        environment: { clock, log, repos, mint: mintFactId },
        models: { summarizer: (): Writer => backends.summarizer(), enumerator: (): Enumerator | null => backends.enumerator() },
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
        curate: curation.request,
        afterRun: curation.afterRun,
        on: (event): void => {
            if (event.kind === 'recap-written') {
                ranRun(events, board, { scope: must(parseTabId(event.scope)), turns: event.turns, boundary: event.boundary, ...(event.cause === undefined ? {} : { cause: must(parseText(event.cause)) }) });
            }
            ledger(event);
        },
    });
    return { engine, recaps: tabRecaps(engine), viewers };
}
