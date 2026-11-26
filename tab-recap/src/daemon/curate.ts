import type * as sl from '@stateforge-labs/session-ledger';
import { curate, type Curating } from '@stateforge-labs/session-ledger';
import type { Store } from '#src/adapters/db/database.ts';
import { RUBRIC } from '#src/adapters/job/prompts/rubric.ts';
import type { Curators } from '@stateforge-labs/session-ledger';
import type { Clock } from '@stateforge-labs/session-ledger';
import type { TranscriptRegistry } from '@stateforge-labs/session-ledger';
import { checkedLedger, checkedRecords } from '#src/ports/guarded-reads.ts';
import { textOf, type Text } from '@stateforge-labs/session-ledger';
import { loadSettings } from './config.ts';
import { scopeOf } from '#src/engine/engine-adapter.ts';
import type { ScopeId } from '#src/recap/domain/ids.ts';

const NO_REPO: sl.RepoResult = { kind: 'no-repo' };
const FULL_VIEW: sl.WriterView = { kind: 'full' };

interface CurationParts {
    readonly store: Store;
    readonly curator: () => Curators | null;
    readonly transcripts: TranscriptRegistry;
    readonly clock: Clock;
    readonly log: (line: Text) => void;
}

export function curationOf(parts: CurationParts): Curating {
    const { store, curator, transcripts, clock, log } = parts;
    const records = checkedRecords(store.records);
    const ledger = checkedLedger(store.ledger);
    const plugs: sl.EnginePlugs = {
        source: { sessions: { readerFor: () => undefined, unavailableReason: (harness) => textOf(`no reader for ${harness}`) } },
        store: {
            records: {
                readRecap: (scope) => records.readRecap(scope),
                lastRunOf: (scope) => records.lastRunOf(scope),
                beginRun: () => { },
                recordRun: () => { },
                failRun: () => { },
                advance: () => { },
            },
            facts: {
                openOf: (task) => ledger.openOf(task),
                recentlyClosed: (task, since) => ledger.recentlyClosed(task, since),
                allOf: (task) => ledger.allOf(task),
                keysOf: (scope) => ledger.keysOf(scope),
                historyOf: () => [],
            },
            stories: { read: (task) => store.stories.read(task.scope, task.key), keep: (run, change) => store.stories.keep(run, change) },
        },
        models: { writer: () => { throw new Error('curation does not write recaps'); }, curator },
        environment: { clock, ids: { next: () => { throw new Error('curation mints no ids'); } }, workplaces: { repoOf: () => Promise.resolve(NO_REPO) }, log },
        settings: {
            language: () => loadSettings().recapLanguage,
            writerView: () => FULL_VIEW,
            rubric: () => RUBRIC.items,
            storyRepair: () => loadSettings().curatorRepair,
            reconcileEvery: () => loadSettings().reconcileEvery,
        },
    };
    return curate(plugs, { ledger, readers: transcripts });
}

export async function curated(engine: sl.Engine, tab: ScopeId, log: (line: Text) => void): Promise<void> {
    const scope = scopeOf(tab);
    if (scope === null) {
        log(textOf(`curator ${tab}: skipped, the tab id is not a scope`));
        return;
    }
    await engine.curate(scope);
}
