// The four arms of EXP-002: who answers the questions. Each arm makes one decider per lane (a lane is one concurrent call; Codex needs its own work folder).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Decider } from '#src/ports/decider.ts';
import type { Harness, HarnessSettings } from '#src/ports/harness.ts';
import { configGetter } from '#src/daemon/config.ts';
import { JEV_MODEL_DEFAULT, JEV_URL_DEFAULT } from '#src/recap/domain/autocompact.ts';
import { ClaudeHarness } from './claude-harness.ts';
import { CodexHarness } from './codex-harness.ts';
import { HarnessDecider } from './harness-decider.ts';
import { JevDecider } from './jev-decider.ts';
import { jevKey } from './jev-key.ts';

export type ArmName = 'jev' | 'haiku-low' | 'haiku-medium' | 'luna-low';

export const ARMS: readonly ArmName[] = ['jev', 'haiku-low', 'haiku-medium', 'luna-low'];

const TIMEOUT_MS = 5 * 60_000;

const readKeyFile = (path: string): string | null => {
    try { return readFileSync(path, 'utf8'); } catch { return null; }
};

const harnessArms: Readonly<Record<Exclude<ArmName, 'jev'>, { readonly make: (dir: string) => Harness; readonly settings: HarnessSettings }>> = {
    'haiku-low': { make: (dir) => new ClaudeHarness(dir, TIMEOUT_MS), settings: { model: 'claude-haiku-5-5', effort: 'low' } },
    'haiku-medium': { make: (dir) => new ClaudeHarness(dir, TIMEOUT_MS), settings: { model: 'claude-haiku-5-5', effort: 'medium' } },
    'luna-low': { make: (dir) => new CodexHarness(dir, TIMEOUT_MS), settings: { model: 'gpt-6-luna', effort: 'low' } },
};

/** The decider of an arm for one lane; `work` is the arm's work folder. */
export function deciderOf(arm: ArmName, work: string, lane: number): Decider {
    if (arm === 'jev') return new JevDecider({ url: JEV_URL_DEFAULT, model: JEV_MODEL_DEFAULT, key: () => jevKey(configGetter(), readKeyFile, homedir()) });
    const { make, settings } = harnessArms[arm];
    return new HarnessDecider(make(join(work, `${arm}-${lane}`)), settings);
}

export const isArm = (name: string): name is ArmName => ARMS.some((arm) => arm === name);
