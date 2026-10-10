import type { Store } from '#src/adapters/db/database.ts';
import type { HerdrFleet } from '#src/adapters/herdr-fleet.ts';
import type { Autocompact } from '#src/recap/application/autocompact.ts';
import { Dispatch } from '#src/recap/application/dispatch.ts';
import type { Informer } from '#src/recap/application/informer.ts';
import type { LaneContexts } from '#src/recap/application/lane-contexts.ts';
import type { LaneWebs } from '#src/recap/application/lane-webs.ts';
import { LivePrompts } from '#src/recap/application/live-prompts.ts';
import type { RecapJob } from '#src/recap/application/recap-job.ts';
import type { Board } from '#src/recap/domain/board.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import type { Sizing } from '#src/recap/domain/layout.ts';
import type { TranscriptRegistryInput } from '#src/adapters/transcript-registry.ts';
import { loadConfig } from './config.ts';

export interface Box {
    informer: Informer | null;
    autocompact: Autocompact | null;
}

export function dispatchFor(box: Box, parts: { readonly fleet: HerdrFleet; readonly store: Store; readonly recaps: RecapJob; readonly transcripts: TranscriptRegistryInput; readonly webs: LaneWebs; readonly contexts: LaneContexts }, log: (line: string) => void): Dispatch {
    return new Dispatch({
        columns: parts.fleet, views: parts.store.views, visibility: parts.store.visibility, recaps: parts.recaps, log, prompts: new LivePrompts(parts.transcripts), webs: parts.webs, contexts: parts.contexts,
        sizing: (): Sizing => loadConfig().sizing,
        board: (): Board => {
            if (box.informer === null) {
                throw new Error('dispatch before the informer exists');
            }
            return box.informer.current;
        },
        feedback: (observation: Observation): void => { box.informer?.push(observation); },
        settled: (lane): void => { void box.autocompact?.consider(lane); },
    });
}
