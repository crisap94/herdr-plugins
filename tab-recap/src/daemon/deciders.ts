import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { HarnessDecider } from '#src/adapters/harness-decider.ts';
import { JevDecider } from '#src/adapters/jev-decider.ts';
import { jevKey } from '#src/adapters/jev-key.ts';
import type { Decider } from '#src/ports/decider.ts';
import { placementOf } from '#src/recap/domain/job.ts';
import type { Job } from '#src/recap/domain/job.ts';
import { configGetter } from './config.ts';
import type { Config } from './config.ts';
import { jobTagFor, MAKERS } from './harness-makers.ts';
import type { JobCall } from '#src/recap/domain/job-tag.ts';

function harnessDeciderFor(config: Config, job: Job, available: readonly string[], work: string, call: JobCall): Decider | null {
    const placed = placementOf(job, { backend: config.backend, models: config.models }, available);
    return placed === null ? null : new HarnessDecider(MAKERS[placed.harness](config, work, jobTagFor(config, call)), { model: placed.model, effort: placed.effort });
}

const readKeyFile = (path: string): string | null => {
    try { return readFileSync(path, 'utf8'); } catch { return null; }
};

function jevDecider(config: Config): Decider {
    return new JevDecider({ url: config.jev.url, model: config.jev.model, key: () => jevKey(configGetter(), readKeyFile, homedir()) });
}

export function deciderFor(config: Config, available: readonly string[], work: string): Decider | null {
    const { by } = config.decider;
    if (by === 'jev') {
        return jevDecider(config);
    }
    return harnessDeciderFor(config, { ...config.decider, by }, available, work, 'decider');
}

export function coverageDeciderFor(config: Config, available: readonly string[], work: string): Decider | null {
    const { by } = config.decider;
    const jevKeyFound = config.coverage === 'auto' && jevKey(configGetter(), readKeyFile, homedir()) !== null;
    if (config.coverage === 'jev' || jevKeyFound) {
        return jevDecider(config);
    }
    if (by === 'jev') {
        return jevDecider(config);
    }
    return harnessDeciderFor(config, { ...config.decider, by }, available, work, 'coverageCheck');
}
