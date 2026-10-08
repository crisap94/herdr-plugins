import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ClaudeHarness } from '#src/adapters/claude-harness.ts';
import { CodexHarness } from '#src/adapters/codex-harness.ts';
import { CustomHarness } from '#src/adapters/custom-harness.ts';
import { HermesHarness } from '#src/adapters/hermes-harness.ts';
import { OpencodeHarness } from '#src/adapters/opencode-harness.ts';
import { HarnessBrief } from '#src/adapters/harness-brief.ts';
import { HarnessJudge } from '#src/adapters/harness-judge.ts';
import { HarnessCurator } from '#src/adapters/harness-curator.ts';
import { HarnessEnumerator } from '#src/adapters/harness-enumerator.ts';
import { HarnessDecider } from '#src/adapters/harness-decider.ts';
import { JevDecider } from '#src/adapters/jev-decider.ts';
import { jevKey } from '#src/adapters/jev-key.ts';
import { RecapWriter } from '#src/adapters/recap-writer.ts';
import type { CompactionBriefs } from '#src/ports/compaction-briefs.ts';
import type { Decider } from '#src/ports/decider.ts';
import type { Curators } from '#src/ports/curators.ts';
import type { Enumerators } from '#src/ports/enumerators.ts';
import type { Harness } from '#src/ports/harness.ts';
import type { CheckAnchors, Judge } from '#src/ports/judge.ts';
import type { Harnesses, HarnessesResult } from '#src/ports/harnesses.ts';
import type { Notifier } from '#src/ports/notifier.ts';
import type { Summarizer, Written } from '#src/ports/summarizer.ts';
import { isUnknown, saying, unknown } from '#src/ports/unknowable.ts';
import { configGetter, loadConfig } from './config.ts';
import { pick } from '#src/recap/domain/backend.ts';
import type { BackendId } from '#src/recap/domain/backend.ts';
import { placementOf } from '#src/recap/domain/job.ts';
import type { Config } from './config.ts';

export { AUTO_ORDER, pick } from '#src/recap/domain/backend.ts';

type Make = (config: Config, work: string) => Harness;

const MAKERS: Readonly<Record<BackendId, Make>> = {
    claude: (config, work) => new ClaudeHarness(work, config.timeoutMs),
    codex: (config, work) => new CodexHarness(work, config.timeoutMs),
    opencode: (config, work) => new OpencodeHarness(work, config.timeoutMs),
    hermes: (config, work) => new HermesHarness(work, config.timeoutMs),
    custom: (config, work) => new CustomHarness(config.customCommand, work, config.timeoutMs),
};

/** Herdr's list and the PATH must both say yes; when herdr cannot be asked, the PATH alone decides. */
export function intersect(fromHerdr: HarnessesResult, fromPath: HarnessesResult): HarnessesResult {
    if (isUnknown(fromPath)) {
        return fromHerdr;
    }
    return isUnknown(fromHerdr) ? fromPath : { kind: 'available', ids: fromPath.ids.filter((id) => fromHerdr.ids.includes(id)) };
}

const NONE = 'a coding agent to write recaps: install claude, codex, opencode or hermes (or set TAB_RECAP_BACKEND / TAB_RECAP_CUSTOM_CMD)';

class Nothing implements Summarizer {
    readonly backend = 'none';
    write(): Promise<Written> {
        return Promise.resolve(unknown({ why: 'not-found', what: NONE }));
    }
}

/** The summarizer `config` asks for, given what is available; one that explains itself when there is none. */
export function summarizerFor(config: Config, available: readonly string[], work: string): Summarizer {
    const id = pick(config.backend, available);
    return id === null ? new Nothing() : new RecapWriter(MAKERS[id](config, work), { model: config.models[id], effort: config.effort });
}

/** The enumeration: the recap writer's harness and model at low effort (it lists candidates, the writer decides); null when no harness is there or the writer is a custom command, whose contract is the single call. */
export function enumeratorFor(config: Config, available: readonly string[], work: string): Enumerators | null {
    const id = pick(config.backend, available);
    return id === null || id === 'custom' ? null : new HarnessEnumerator(MAKERS[id](config, work), { model: config.models[id], effort: 'low' });
}

/** The compaction brief's writer: the job's placement on a harness; null when the job is off or no harness is there. */
export function briefFor(config: Config, available: readonly string[], work: string): CompactionBriefs | null {
    const placed = placementOf(config.brief, { backend: config.backend, models: config.models }, available);
    return placed === null ? null : new HarnessBrief(MAKERS[placed.harness](config, work), { model: placed.model, effort: placed.effort });
}

/** The judge's model: the job's placement on a harness; null when the job is off or no harness is there. */
export function judgeFor(config: Config, available: readonly string[], work: string, anchors?: CheckAnchors): Judge | null {
    const placed = placementOf(config.judge, { backend: config.backend, models: config.models }, available);
    return placed === null ? null : new HarnessJudge(MAKERS[placed.harness](config, work), { model: placed.model, effort: placed.effort }, anchors);
}

/** The curator: the job's placement on a harness; null when the job is off or no harness is there. */
export function curatorFor(config: Config, available: readonly string[], work: string): Curators | null {
    const placed = placementOf(config.curator, { backend: config.backend, models: config.models }, available);
    return placed === null ? null : new HarnessCurator(MAKERS[placed.harness](config, work), { model: placed.model, effort: placed.effort });
}

const readKeyFile = (path: string): string | null => {
    try { return readFileSync(path, 'utf8'); } catch { return null; }
};

/** The decider: the TypeSafe API for `jev`, else the job's placement on a harness; null when the job is off or no harness is there. */
export function deciderFor(config: Config, available: readonly string[], work: string): Decider | null {
    const { by } = config.decider;
    if (by === 'jev') {
        return new JevDecider({ url: config.jev.url, model: config.jev.model, key: () => jevKey(configGetter(), readKeyFile, homedir()) });
    }
    const placed = placementOf({ ...config.decider, by }, { backend: config.backend, models: config.models }, available);
    return placed === null ? null : new HarnessDecider(MAKERS[placed.harness](config, work), { model: placed.model, effort: placed.effort });
}

/**
 * Picks the summarizer for each recap. The configuration is re-read every time (a switch applies at once);
 * what is installed is looked up at start and on every resync and cached, so `summarizer()` stays synchronous.
 */
export class Backends {
    private available: readonly string[] = [];
    private warned = false;
    private readonly work: string;
    private readonly sources: { readonly herdr: Harnesses; readonly path: Harnesses };
    private readonly notifier: Notifier;
    private readonly log: (line: string) => void;

    constructor(root: string, sources: { readonly herdr: Harnesses; readonly path: Harnesses }, notifier: Notifier, log: (line: string) => void) {
        this.work = join(root, 'summarizer');
        this.sources = sources;
        this.notifier = notifier;
        this.log = log;
    }

    async refresh(): Promise<void> {
        const found = intersect(await this.sources.herdr.available(), await this.sources.path.available());
        if (isUnknown(found)) {
            this.log(`harness lookup failed: ${saying(found.why)}`);
            return;
        }
        this.available = found.ids;
        await this.warnWhenNone();
    }

    /** One toast per daemon start, and only when `auto` has nothing to choose from. */
    private async warnWhenNone(): Promise<void> {
        if (this.warned || loadConfig().backend !== 'auto' || pick('auto', this.available) !== null) {
            return;
        }
        this.warned = true;
        this.log(`no backend: ${NONE}`);
        await this.notifier.notify('Tab Recap', `No recap writer found — ${NONE}`);
    }

    brief(): CompactionBriefs | null {
        return briefFor(loadConfig(), this.available, this.work);
    }

    decider(): Decider | null {
        return deciderFor(loadConfig(), this.available, this.work);
    }

    curator(): Curators | null {
        return curatorFor(loadConfig(), this.available, this.work);
    }

    summarizer(): Summarizer {
        return summarizerFor(loadConfig(), this.available, this.work);
    }

    enumerator(): Enumerators | null {
        return enumeratorFor(loadConfig(), this.available, this.work);
    }
}
