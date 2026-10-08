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

/** The TypeSafe API as a decider; with no key it answers unknown, so a check that needs it fails closed. */
function jevDecider(config: Config): Decider {
    return new JevDecider({ url: config.jev.url, model: config.jev.model, key: () => jevKey(configGetter(), readKeyFile, homedir()) });
}

/** The decider: the TypeSafe API for `jev`, else the job's placement on a harness; null when the job is off or no harness is there. */
export function deciderFor(config: Config, available: readonly string[], work: string): Decider | null {
    const { by } = config.decider;
    if (by === 'jev') {
        return jevDecider(config);
    }
    const placed = placementOf({ ...config.decider, by }, { backend: config.backend, models: config.models }, available);
    return placed === null ? null : new HarnessDecider(MAKERS[placed.harness](config, work), { model: placed.model, effort: placed.effort });
}

/** The decider that checks a brief's coverage: `jev` always, `decider` the moment decider, `auto` Jev when a key is found, else the moment decider. */
export function coverageDeciderFor(config: Config, available: readonly string[], work: string): Decider | null {
    const jevKeyFound = config.coverage === 'auto' && jevKey(configGetter(), readKeyFile, homedir()) !== null;
    if (config.coverage === 'jev' || jevKeyFound) {
        return jevDecider(config);
    }
    return deciderFor(config, available, work);
}
