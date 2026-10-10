import { nodeHost } from '#src/host/node-host.mjs';
import type { Platform } from '#src/ports/host.ts';
import type { ProcessControl, Runner } from '#src/ports/process-control.ts';
import { posixProcess } from './process-posix.ts';
import { windowsProcess } from './process-windows.ts';

export type { Runner, RunOptions, RunResult } from '#src/ports/process-control.ts';
export { KILL_AFTER_MS } from './process-core.ts';

export const processFor = (platform: Platform): ProcessControl => (platform === 'windows' ? windowsProcess() : posixProcess());

export const hostProcess: ProcessControl = processFor(nodeHost().platform);

export const run: Runner = hostProcess.run;

export function scrubbedEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (!key.startsWith('HERDR_') && !key.startsWith('TAB_RECAP_') && key !== 'CLAUDECODE' && key !== 'CLAUDE_CODE_ENTRYPOINT') {
            env[key] = value;
        }
    }
    return env;
}
