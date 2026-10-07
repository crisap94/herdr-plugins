// The ProcessControl for this host, chosen once by platform, and the environment a spawned program gets.
import { nodeHost } from '#src/host/node-host.mjs';
import type { Platform } from '#src/ports/host.ts';
import type { ProcessControl, Runner } from '#src/ports/process-control.ts';
import { posixProcess } from './process-posix.ts';
import { windowsProcess } from './process-windows.ts';

export type { Runner, RunOptions, RunResult } from '#src/ports/process-control.ts';
export { KILL_AFTER_MS } from './process-core.ts';

export const processFor = (platform: Platform): ProcessControl => (platform === 'windows' ? windowsProcess() : posixProcess());

/** The process control of the machine the plugin runs on. */
export const hostProcess: ProcessControl = processFor(nodeHost().platform);

/** What the harnesses and git run programs with. */
export const run: Runner = hostProcess.run;

/**
 * A summarizer must not look like an agent to herdr: herdr's Claude hook registers any
 * claude that starts with HERDR_PANE_ID set as the agent of that pane.
 */
export function scrubbedEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (!key.startsWith('HERDR_') && !key.startsWith('TAB_RECAP_') && key !== 'CLAUDECODE' && key !== 'CLAUDE_CODE_ENTRYPOINT') {
            env[key] = value;
        }
    }
    return env;
}
