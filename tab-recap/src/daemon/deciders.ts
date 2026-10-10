import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { HarnessDecider } from '#src/adapters/harness-decider.ts';
import { JevDecider } from '#src/adapters/jev-decider.ts';
import { jevKey } from '#src/adapters/jev-key.ts';
import type { Decider } from '#src/ports/decider.ts';
import { placementOf } from '#src/recap/domain/job.ts';
import { configGetter } from './config.ts';
import type { Config } from './config.ts';
import { MAKERS } from './harness-makers.ts';

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
    const placed = placementOf({ ...config.decider, by }, { backend: config.backend, models: config.models }, available);
    return placed === null ? null : new HarnessDecider(MAKERS[placed.harness](config, work), { model: placed.model, effort: placed.effort });
}

export function coverageDeciderFor(config: Config, available: readonly string[], work: string): Decider | null {
    const jevKeyFound = config.coverage === 'auto' && jevKey(configGetter(), readKeyFile, homedir()) !== null;
    if (config.coverage === 'jev' || jevKeyFound) {
        return jevDecider(config);
    }
    return deciderFor(config, available, work);
}
