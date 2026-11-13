import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import type { Environment } from './compose.ts';
import { HOOK_SETTINGS } from './hook.ts';
import type { HookSession } from './payload.ts';
import { LOG_FILE } from './runner.ts';

export const RUNNER_SCRIPT = join(import.meta.dirname, 'run.ts');

export const runnerScriptOf = (env: Environment): string => {
    const given = env[HOOK_SETTINGS.runner]?.trim() ?? '';
    return given === '' ? RUNNER_SCRIPT : given;
};

export const runnerArgsOf = (script: string, hook: HookSession): readonly string[] => [script, hook.session, hook.records, hook.cwd];

export function detachedRunner(stateDir: string, env: Environment, log: (line: string) => void): (hook: HookSession) => void {
    return (hook: HookSession): void => {
        mkdirSync(stateDir, { recursive: true });
        const out = openSync(join(stateDir, LOG_FILE), 'a');
        try {
            const child = spawn(process.execPath, runnerArgsOf(runnerScriptOf(env), hook), { detached: true, stdio: ['ignore', out, out], env: { ...env } });
            child.on('error', (error) => { log(`the runner of ${hook.session} did not start: ${error.message}`); });
            child.unref();
        } finally {
            closeSync(out);
        }
    };
}
