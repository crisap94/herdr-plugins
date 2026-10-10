import { nodeHost } from '#src/host/node-host.mjs';
import type { Platform } from '#src/ports/host.ts';
import type { ProcessControl, Runner } from '#src/ports/process-control.ts';
import { jobEnvironmentNames } from '#src/recap/domain/backend.ts';
import type { EnvironmentName } from '#src/recap/domain/backend.ts';
import { posixProcess } from './process-posix.ts';
import { windowsProcess } from './process-windows.ts';

export type { Runner, RunOptions, RunResult } from '#src/ports/process-control.ts';
export { KILL_AFTER_MS } from './process-core.ts';

export const processFor = (platform: Platform): ProcessControl => (platform === 'windows' ? windowsProcess() : posixProcess());

export const hostProcess: ProcessControl = processFor(nodeHost().platform);

export const run: Runner = hostProcess.run;

const SCRUBBED_ENV_NAMES = jobEnvironmentNames();

export function scrubEnvironment(source: NodeJS.ProcessEnv, names: readonly EnvironmentName[]): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    const scrubbed = new Set<string>(names);
    for (const [key, value] of Object.entries(source)) {
        if (!key.startsWith('HERDR_') && !key.startsWith('TAB_RECAP_') && !scrubbed.has(key)) {
            env[key] = value;
        }
    }
    return env;
}

export function scrubbedEnv(): NodeJS.ProcessEnv {
    return scrubEnvironment(process.env, SCRUBBED_ENV_NAMES);
}
