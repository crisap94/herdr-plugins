import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import type { Decider } from '#src/ports/decider.ts';
import type { HarnessChoice, HarnessPort } from '#src/ports/harness.ts';
import { loadConfig, settingReader } from '#src/daemon/config.ts';
import { parseJevModel, parseJevUrl } from '#src/recap/domain/autocompact.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
import { must } from '#src/protocol/result.ts';
import { LIBRARY_IDS, LibraryHarnessPort } from '../harness/library.ts';
import { uncheckedMilliseconds } from '#src/recap/domain/ids.ts';
import type { Acknowledgement, HarnessRuntime } from '../harness/library.ts';
import { HarnessPortDecider } from '../job/decider.ts';
import { JevPortDecider } from '../job/jev-decider.ts';
import { jevKey } from '../job/jev-key.ts';

export type ArmName = 'jev' | 'haiku-low' | 'haiku-medium' | 'luna-low';

export const ARMS: readonly ArmName[] = ['jev', 'haiku-low', 'haiku-medium', 'luna-low'];

const TIMEOUT_MS = uncheckedMilliseconds(5 * 60_000);

const acknowledgement = (): Acknowledgement => (loadConfig().claudePolicyAck === 'on' ? 'acknowledged' : 'unacknowledged');

const readKeyFile = (path: FsPath): Text | null => {
    try { return must(parseText(readFileSync(path, 'utf8'))); } catch { return null; }
};

const harnessArms: Readonly<Record<Exclude<ArmName, 'jev'>, { readonly make: (runtime: HarnessRuntime) => HarnessPort; readonly settings: HarnessChoice }>> = {
    'haiku-low': { make: (runtime) => new LibraryHarnessPort(runtime, LIBRARY_IDS.claude, TIMEOUT_MS, undefined, acknowledgement()), settings: { model: textOf('claude-haiku-5-5'), effort: 'low' } },
    'haiku-medium': { make: (runtime) => new LibraryHarnessPort(runtime, LIBRARY_IDS.claude, TIMEOUT_MS, undefined, acknowledgement()), settings: { model: textOf('claude-haiku-5-5'), effort: 'medium' } },
    'luna-low': { make: (runtime) => new LibraryHarnessPort(runtime, LIBRARY_IDS.codex, TIMEOUT_MS), settings: { model: textOf('gpt-6-luna'), effort: 'low' } },
};

export function deciderOf(arm: ArmName, runtime: HarnessRuntime): Decider {
    if (arm === 'jev') return new JevPortDecider({ url: parseJevUrl(undefined), model: parseJevModel(undefined), key: () => jevKey(settingReader(), readKeyFile, must(parseText(process.env['HOME'] ?? homedir()))) });
    const { make, settings } = harnessArms[arm];
    return new HarnessPortDecider(make(runtime), settings);
}

export const isArm = (input: unknown): input is ArmName => typeof input === 'string' && ARMS.some((arm) => arm === input);
