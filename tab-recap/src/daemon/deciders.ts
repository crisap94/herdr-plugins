import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { HarnessDecider } from '#src/adapters/job/decider.ts';
import { JevDecider } from '#src/adapters/job/jev-decider.ts';
import { jevKey } from '#src/adapters/job/jev-key.ts';
import type { Decider } from '#src/ports/decider.ts';
import { placementOf } from '#src/recap/domain/job.ts';
import type { Job } from '#src/recap/domain/job.ts';
import { configGetter } from './config.ts';
import type { Config } from './config.ts';
import type { HarnessRuntime } from '#src/adapters/harness/library.ts';
import { jobTagFor, MAKERS } from './harness-makers.ts';
import type { JobCall, JobTag } from '#src/recap/domain/job-tag.ts';
import type { Harness } from '#src/ports/harness.ts';
import type { BackendId } from '#src/recap/domain/backend.ts';

type HarnessFor = (harness: BackendId, tag: JobTag | undefined) => Harness<BackendId>;

function harnessDeciderFor(config: Config, job: Job, available: readonly string[], harnessFor: HarnessFor, call: JobCall): Decider | null {
    const placed = placementOf(job, { backend: config.backend, models: config.models }, available);
    return placed === null ? null : new HarnessDecider(harnessFor(placed.harness, jobTagFor(config, call)), { model: placed.model, effort: placed.effort });
}

const readKeyFile = (path: string): string | null => {
    try { return readFileSync(path, 'utf8'); } catch { return null; }
};

function jevDecider(config: Config): Decider {
    return new JevDecider({ url: config.jev.url, model: config.jev.model, key: () => jevKey(configGetter(), readKeyFile, process.env['HOME'] ?? homedir()) });
}

export function deciderFor(config: Config, available: readonly string[], work: string, runtime: HarnessRuntime): Decider | null {
    const { by } = config.decider;
    if (by === 'jev') {
        return jevDecider(config);
    }
    return harnessDeciderFor(config, { ...config.decider, by }, available, (id, tag) => MAKERS[id](config, work, runtime, tag), 'decider');
}

export function coverageDeciderFor(config: Config, available: readonly string[], work: string, runtime: HarnessRuntime): Decider | null {
    const { by } = config.decider;
    const jevKeyFound = config.coverage === 'auto' && jevKey(configGetter(), readKeyFile, process.env['HOME'] ?? homedir()) !== null;
    if (config.coverage === 'jev' || jevKeyFound) {
        return jevDecider(config);
    }
    if (by === 'jev') {
        return jevDecider(config);
    }
    return harnessDeciderFor(config, { ...config.decider, by }, available, (id, tag) => MAKERS[id](config, work, runtime, tag), 'coverageCheck');
}
