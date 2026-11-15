import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import type { Decider } from '#src/ports/decider.ts';
import type { Harness, HarnessSettings } from '#src/ports/harness.ts';
import { configGetter, loadConfig } from '#src/daemon/config.ts';
import { JEV_MODEL_DEFAULT, JEV_URL_DEFAULT } from '#src/recap/domain/autocompact.ts';
import { LIBRARY_IDS, LibraryHarness } from '../harness/library.ts';
import type { HarnessRuntime } from '../harness/library.ts';
import { HarnessDecider } from '../job/decider.ts';
import { JevDecider } from '../job/jev-decider.ts';
import { jevKey } from '../job/jev-key.ts';

export type ArmName = 'jev' | 'haiku-low' | 'haiku-medium' | 'luna-low';

export const ARMS: readonly ArmName[] = ['jev', 'haiku-low', 'haiku-medium', 'luna-low'];

const TIMEOUT_MS = 5 * 60_000;

const readKeyFile = (path: string): string | null => {
    try { return readFileSync(path, 'utf8'); } catch { return null; }
};

const harnessArms: Readonly<Record<Exclude<ArmName, 'jev'>, { readonly make: (runtime: HarnessRuntime) => Harness; readonly settings: HarnessSettings }>> = {
    'haiku-low': { make: (runtime) => new LibraryHarness(runtime, LIBRARY_IDS.claude, TIMEOUT_MS, undefined, loadConfig().claudePolicyAck === 'on'), settings: { model: 'claude-haiku-5-5', effort: 'low' } },
    'haiku-medium': { make: (runtime) => new LibraryHarness(runtime, LIBRARY_IDS.claude, TIMEOUT_MS, undefined, loadConfig().claudePolicyAck === 'on'), settings: { model: 'claude-haiku-5-5', effort: 'medium' } },
    'luna-low': { make: (runtime) => new LibraryHarness(runtime, LIBRARY_IDS.codex, TIMEOUT_MS), settings: { model: 'gpt-6-luna', effort: 'low' } },
};

export function deciderOf(arm: ArmName, runtime: HarnessRuntime): Decider {
    if (arm === 'jev') return new JevDecider({ url: JEV_URL_DEFAULT, model: JEV_MODEL_DEFAULT, key: () => jevKey(configGetter(), readKeyFile, process.env['HOME'] ?? homedir()) });
    const { make, settings } = harnessArms[arm];
    return new HarnessDecider(make(runtime), settings);
}

export const isArm = (name: string): name is ArmName => ARMS.some((arm) => arm === name);
