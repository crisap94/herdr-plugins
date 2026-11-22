import { join } from 'node:path';
import { HarnessBrief } from '#src/adapters/job/brief.ts';
import { HarnessJudge } from '#src/adapters/job/judge.ts';
import { HarnessCurator } from '#src/adapters/job/curator.ts';
import { HarnessEnumerator } from '#src/adapters/job/enumerator.ts';
import { RecapWriter } from '#src/adapters/job/writer.ts';
import type { CompactionBriefs } from '#src/ports/compaction-briefs.ts';
import type { Decider, DeciderPort } from '#src/ports/decider.ts';
import type { Curators } from '#src/ports/curators.ts';
import type { Enumerators } from '#src/ports/enumerators.ts';
import type { CheckAnchor, Judge } from '#src/ports/judge.ts';
import type { Harnesses, HarnessesResult } from '#src/ports/harnesses.ts';
import type { Notifier } from '#src/ports/notifier.ts';
import type { Summarizer, Written } from '#src/ports/summarizer.ts';
import { isUnknown, saying, unknown } from '#src/ports/unknowable.ts';
import type { HarnessRuntime } from '#src/adapters/harness/library.ts';
import type { LogLine } from '#src/ports/harness.ts';
import { coverageDeciderFor, deciderPortFor } from './deciders.ts';
import { loadConfig } from './config.ts';
import { MAKERS } from './harness-makers.ts';
import { BACKEND_IDS, enumeratesJob, installableHarnessSentence, pick, type BackendId } from '#src/recap/domain/backend.ts';
import { placementFor } from '#src/recap/domain/job.ts';
import { parseDirectory, type Directory } from '#src/recap/domain/directory.ts';
import { parseText, type Text, textOf } from '#src/recap/domain/text.ts';
import { must } from '#src/protocol/result.ts';
import type { Config } from './config.ts';
import { jobTagFor } from './harness-makers.ts';

export { AUTO_ORDER, pick } from '#src/recap/domain/backend.ts';
import { judgeVia } from './legacy.ts';

export { availableIn, judgeFor, summarizerWork } from './legacy.ts';

export type Available = readonly BackendId[];

type Warning = 'unwarned' | 'warned';

export type TextAnchors = ReadonlyMap<Text, readonly CheckAnchor[]>;

export function summarizerWorkIn(root: Directory): Directory {
    return must(parseDirectory(join(root, 'summarizer')));
}

export function intersect(fromHerdr: HarnessesResult, fromPath: HarnessesResult): HarnessesResult {
    if (isUnknown(fromPath)) {
        return fromHerdr;
    }
    return isUnknown(fromHerdr) ? fromPath : { kind: 'available', ids: fromPath.ids.filter((id) => fromHerdr.ids.includes(id)) };
}

const NONE = `a coding agent to write recaps: install ${installableHarnessSentence()} (or set TAB_RECAP_BACKEND / TAB_RECAP_CUSTOM_CMD)`;

class Nothing implements Summarizer {
    readonly backend = must(parseText('none'));
    readonly contract = 'strict';
    write(): Promise<Written> {
        return Promise.resolve(unknown({ why: 'not-found', what: textOf(NONE) }));
    }
}

export function summarizerFor(config: Config, available: Available, work: Directory, runtime: HarnessRuntime, log?: LogLine): Summarizer {
    const id = pick(config.backend, available);
    return id === null ? new Nothing() : new RecapWriter(MAKERS[id](config, work, runtime, jobTagFor(config, 'recapWriter'), log), { model: config.models[id], effort: config.effort }, config.writerAnswer ?? 'text');
}

export function enumeratorFor(config: Config, available: Available, work: Directory, runtime: HarnessRuntime, log?: LogLine): Enumerators | null {
    const id = pick(config.backend, available);
    return id === null || !enumeratesJob(id) ? null : new HarnessEnumerator(MAKERS[id](config, work, runtime, jobTagFor(config, 'enumerator'), log), { model: config.models[id], effort: 'low' });
}

export function briefFor(config: Config, available: Available, work: Directory, runtime: HarnessRuntime, log?: LogLine): CompactionBriefs | null {
    const placed = placementFor(config.brief, { backend: config.backend, models: config.models }, available);
    return placed === null ? null : new HarnessBrief(MAKERS[placed.harness](config, work, runtime, jobTagFor(config, 'compactionBrief'), log), { model: placed.model, effort: placed.effort });
}

export function judgeWith(config: Config, available: Available, work: Directory, runtime: HarnessRuntime, anchors?: TextAnchors): Judge | null {
    const placed = placementFor(config.judge, { backend: config.backend, models: config.models }, available);
    return placed === null ? null : new HarnessJudge(MAKERS[placed.harness](config, work, runtime, jobTagFor(config, 'judge')), { model: placed.model, effort: placed.effort }, anchors);
}

judgeVia(judgeWith);

export function curatorFor(config: Config, available: Available, work: Directory, runtime: HarnessRuntime, log?: LogLine): Curators | null {
    const placed = placementFor(config.curator, { backend: config.backend, models: config.models }, available);
    return placed === null ? null : new HarnessCurator(MAKERS[placed.harness](config, work, runtime, jobTagFor(config, 'curator'), log), { model: placed.model, effort: placed.effort, ...(placed.timeoutMs === undefined ? {} : { timeoutMs: placed.timeoutMs }) }, placed.answer ?? 'text');
}

interface HarnessSources {
    readonly herdr: Harnesses;
    readonly path: Harnesses;
}

export class Backends {
    private available: Available = [];
    private warning: Warning = 'unwarned';
    private readonly work: Directory;
    private readonly runtime: HarnessRuntime;
    private readonly sources: HarnessSources;
    private readonly notifier: Notifier;
    private readonly log: LogLine;

    constructor(root: Directory, sources: HarnessSources, notifier: Notifier, log: LogLine, runtime: HarnessRuntime) {
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
        this.available = BACKEND_IDS.filter((known) => found.ids.includes(known));
        await this.warnWhenNone();
    }

    private async warnWhenNone(): Promise<void> {
        if (this.warning === 'warned' || loadConfig().backend !== 'auto' || pick('auto', this.available) !== null) {
            return;
        }
        this.warning = 'warned';
        this.log(must(parseText(`no backend: ${NONE}`)));
        await this.notifier.notify('Tab Recap', `No recap writer found — ${NONE}`);
    }

    brief(): CompactionBriefs | null {
        return briefFor(loadConfig(), this.available, this.work, this.runtime, this.log);
    }

    decider(): DeciderPort | null {
        return deciderPortFor(loadConfig(), this.available, this.work, this.runtime, this.log);
    }

    coverageDecider(): Decider | null {
        return coverageDeciderFor(loadConfig(), this.available, this.work, this.runtime, this.log);
    }

    curator(): Curators | null {
        return curatorFor(loadConfig(), this.available, this.work, this.runtime, this.log);
    }

    summarizer(): Summarizer {
        return summarizerFor(loadConfig(), this.available, this.work, this.runtime, this.log);
    }

    enumerator(): Enumerators | null {
        return enumeratorFor(loadConfig(), this.available, this.work, this.runtime, this.log);
    }
}
