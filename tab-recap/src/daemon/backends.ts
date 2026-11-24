import type { HarnessKind } from '#src/recap/domain/ids.ts';
import { join } from 'node:path';
import { HarnessBrief } from '#src/adapters/job/brief.ts';
import { HarnessJudge } from '#src/adapters/job/judge.ts';
import { HarnessCurator } from '#src/adapters/job/curator.ts';
import { HarnessEnumerator } from '#src/adapters/job/enumerator.ts';
import { RecapWriter } from '#src/adapters/job/writer.ts';
import type { BriefWriter } from '#src/ports/compaction-briefs.ts';
import type { DeciderPort } from '#src/ports/decider.ts';
import type { Curators } from '#src/ports/curators.ts';
import type { Enumerator } from '#src/ports/enumerators.ts';
import type { AnchorChecks, JudgePort } from '#src/ports/judge.ts';
import type { HarnessDirectory, HarnessList } from '#src/ports/harnesses.ts';
import type { NotifierPort } from '#src/ports/notifier.ts';
import type { Writer, Written } from '#src/ports/summarizer.ts';
import { isUnknown, saying, unknown } from '#src/ports/unknowable.ts';
import { RuntimeLoadError } from '#src/adapters/harness/library.ts';
import type { HarnessRuntime } from '#src/adapters/harness/library.ts';
import type { LogLine } from '#src/ports/harness.ts';
import { coverageDeciderFor, deciderFor } from './deciders.ts';
import { loadSettings } from './config.ts';
import { MAKERS } from './harness-makers.ts';
import { BACKEND_IDS, enumeratesJob, installableHarnessSentence, pick, type BackendId } from '#src/recap/domain/backend.ts';
import { placementFor } from '#src/recap/domain/job.ts';
import { parseDirectory, type Directory } from '#src/recap/domain/directory.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
import { must } from '#src/protocol/result.ts';
import type { Settings } from './config.ts';
import { jobTagFor } from './harness-makers.ts';

export { AUTO_ORDER, pick } from '#src/recap/domain/backend.ts';
export type Available = readonly BackendId[];

const isBackendId = (id: HarnessKind): id is HarnessKind & BackendId => BACKEND_IDS.some((known) => known === id);

export function availableIn(ids: readonly HarnessKind[]): Available {
    return ids.filter(isBackendId);
}

type Warning = 'unwarned' | 'warned';

export function summarizerWorkIn(root: Directory): Directory {
    return must(parseDirectory(join(root, 'summarizer')));
}

export function intersect(fromHerdr: HarnessList, fromPath: HarnessList): HarnessList {
    if (isUnknown(fromPath)) {
        return fromHerdr;
    }
    return isUnknown(fromHerdr) ? fromPath : { kind: 'available', ids: fromPath.ids.filter((id) => fromHerdr.ids.includes(id)) };
}

const NONE = `a coding agent to write recaps: install ${installableHarnessSentence()} (or set TAB_RECAP_BACKEND / TAB_RECAP_CUSTOM_CMD)`;

class Nothing implements Writer {
    readonly backend = must(parseText('none'));
    readonly contract = 'strict';
    private readonly what: Text;
    constructor(what: Text = textOf(NONE)) {
        this.what = what;
    }
    write(): Promise<Written> {
        return Promise.resolve(unknown({ why: 'not-found', what: this.what }));
    }
}

export function summarizerFor(config: Settings, available: Available, work: Directory, runtime: HarnessRuntime, log?: LogLine): Writer {
    const id = pick(config.backend, available);
    return id === null ? new Nothing() : new RecapWriter(MAKERS[id](config, work, runtime, jobTagFor(config, 'recapWriter'), log), { model: config.models[id], effort: config.effort }, config.writerAnswer ?? 'text');
}

export function enumeratorFor(config: Settings, available: Available, work: Directory, runtime: HarnessRuntime, log?: LogLine): Enumerator | null {
    const id = pick(config.backend, available);
    return id === null || !enumeratesJob(id) ? null : new HarnessEnumerator(MAKERS[id](config, work, runtime, jobTagFor(config, 'enumerator'), log), { model: config.models[id], effort: 'low' });
}

export function briefFor(config: Settings, available: Available, work: Directory, runtime: HarnessRuntime, log?: LogLine): BriefWriter | null {
    const placed = placementFor(config.brief, { backend: config.backend, models: config.models }, available);
    return placed === null ? null : new HarnessBrief(MAKERS[placed.harness](config, work, runtime, jobTagFor(config, 'compactionBrief'), log), { model: placed.model, effort: placed.effort });
}

export function judgeWith(config: Settings, available: Available, work: Directory, runtime: HarnessRuntime, anchors?: AnchorChecks): JudgePort | null {
    const placed = placementFor(config.judge, { backend: config.backend, models: config.models }, available);
    return placed === null ? null : new HarnessJudge(MAKERS[placed.harness](config, work, runtime, jobTagFor(config, 'judge')), { model: placed.model, effort: placed.effort }, anchors);
}

export function curatorFor(config: Settings, available: Available, work: Directory, runtime: HarnessRuntime, log?: LogLine): Curators | null {
    const placed = placementFor(config.curator, { backend: config.backend, models: config.models }, available);
    return placed === null ? null : new HarnessCurator(MAKERS[placed.harness](config, work, runtime, jobTagFor(config, 'curator'), log), { model: placed.model, effort: placed.effort, ...(placed.timeoutMs === undefined ? {} : { timeoutMs: placed.timeoutMs }) }, placed.answer ?? 'text');
}

interface HarnessSources {
    readonly herdr: HarnessDirectory;
    readonly path: HarnessDirectory;
}

export class Backends {
    private available: Available = [];
    private warning: Warning = 'unwarned';
    private readonly work: Directory;
    private readonly runtime: HarnessRuntime;
    private readonly sources: HarnessSources;
    private readonly notifier: NotifierPort;
    private readonly log: LogLine;
    private readonly reported = new Set<Text>();

    constructor(root: Directory, sources: HarnessSources, notifier: NotifierPort, log: LogLine, runtime: HarnessRuntime) {
        this.work = summarizerWorkIn(root);
        this.runtime = runtime;
        this.sources = sources;
        this.notifier = notifier;
        this.log = log;
    }

    async refresh(): Promise<void> {
        const found = intersect(await this.sources.herdr.available(), await this.sources.path.available());
        if (isUnknown(found)) {
            this.log(must(parseText(`harness lookup failed: ${saying(found.why)}`)));
            return;
        }
        this.available = BACKEND_IDS.filter((known) => found.ids.some((id) => id === known));
        await this.warnWhenNone();
    }

    private async warnWhenNone(): Promise<void> {
        if (this.warning === 'warned' || loadSettings().backend !== 'auto' || pick('auto', this.available) !== null) {
            return;
        }
        this.warning = 'warned';
        this.log(must(parseText(`no backend: ${NONE}`)));
        await this.notifier.notify(textOf('Tab Recap'), textOf(`No recap writer found — ${NONE}`));
    }

    private whenLoaded<Built>(build: () => Built, otherwise: (reason: Text) => Built): Built {
        try {
            return build();
        } catch (error) {
            if (!(error instanceof RuntimeLoadError)) {
                throw error;
            }
            const reason = must(parseText(`harness runtime did not load: ${error.message}`));
            if (!this.reported.has(reason)) {
                this.reported.add(reason);
                this.log(reason);
            }
            return otherwise(reason);
        }
    }

    brief(): BriefWriter | null {
        return this.whenLoaded(() => briefFor(loadSettings(), this.available, this.work, this.runtime, this.log), () => null);
    }

    decider(): DeciderPort | null {
        return this.whenLoaded(() => deciderFor(loadSettings(), this.available, this.work, this.runtime, this.log), () => null);
    }

    coverageDecider(): DeciderPort | null {
        return this.whenLoaded(() => coverageDeciderFor(loadSettings(), this.available, this.work, this.runtime, this.log), () => null);
    }

    curator(): Curators | null {
        return this.whenLoaded(() => curatorFor(loadSettings(), this.available, this.work, this.runtime, this.log), () => null);
    }

    summarizer(): Writer {
        return this.whenLoaded(() => summarizerFor(loadSettings(), this.available, this.work, this.runtime, this.log), (reason) => new Nothing(reason));
    }

    enumerator(): Enumerator | null {
        return this.whenLoaded(() => enumeratorFor(loadSettings(), this.available, this.work, this.runtime, this.log), () => null);
    }
}
