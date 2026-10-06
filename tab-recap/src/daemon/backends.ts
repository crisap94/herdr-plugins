import { join } from 'node:path';
import { ClaudeSummarizer } from '#src/adapters/claude-summarizer.ts';
import { CodexSummarizer } from '#src/adapters/codex-summarizer.ts';
import { CustomSummarizer } from '#src/adapters/custom-summarizer.ts';
import { HermesSummarizer } from '#src/adapters/hermes-summarizer.ts';
import { OpencodeSummarizer } from '#src/adapters/opencode-summarizer.ts';
import type { Harnesses, HarnessesResult } from '#src/ports/harnesses.ts';
import type { Notifier } from '#src/ports/notifier.ts';
import type { Summarizer, Written } from '#src/ports/summarizer.ts';
import { isUnknown, saying, unknown } from '#src/ports/unknowable.ts';
import { loadConfig } from './config.ts';
import { pick } from '#src/recap/domain/backend.ts';
import type { BackendId } from '#src/recap/domain/backend.ts';
import type { Config } from './config.ts';

export { AUTO_ORDER, pick } from '#src/recap/domain/backend.ts';

type Make = (config: Config, work: string) => Summarizer;

const MAKERS: Readonly<Record<BackendId, Make>> = {
    claude: (config, work) => new ClaudeSummarizer(config.models.claude, work, config.timeoutMs, config.effort),
    codex: (config, work) => new CodexSummarizer(config.models.codex, work, config.timeoutMs, config.effort),
    opencode: (config, work) => new OpencodeSummarizer(config.models.opencode, work, config.timeoutMs, config.effort),
    hermes: (config, work) => new HermesSummarizer(config.models.hermes, work, config.timeoutMs, config.effort),
    custom: (config, work) => new CustomSummarizer(config.customCommand, work, config.timeoutMs),
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
    return id === null ? new Nothing() : MAKERS[id](config, work);
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

    summarizer(): Summarizer {
        return summarizerFor(loadConfig(), this.available, this.work);
    }
}
