import { join } from 'node:path';
import { followedOf, openingOf, randomIds } from './compose.ts';
import type { HostPlugs } from './compose.ts';
import { gitWorkplaces, languageOf, onceWriter, restoreBytes, restoreText, systemClock } from './plugs.ts';
import type { Environment } from './plugs.ts';
import { LOCK_DIR, processAlive, processStartOf, SessionLock } from './lock.ts';
import type { HookSession } from './payload.ts';
import { SETTLE_MS, sleepFor } from './runner.ts';
import type { RunnerPlugs } from './runner.ts';

export type HookArgs = { readonly kind: 'hook'; readonly hook: HookSession } | { readonly kind: 'usage' };

export function hookArgsOf(args: readonly string[]): HookArgs {
    const [session = '', records = '', cwd = ''] = args;
    return session === '' || records === '' || cwd === '' ? { kind: 'usage' } : { kind: 'hook', hook: { session, records, cwd } };
}

export function hostPlugsFor(hook: HookSession, env: Environment, stateDir: string, log: (line: string) => void): HostPlugs {
    return { stateDir, records: hook.records, writer: onceWriter(env, log), language: () => languageOf(env), clock: systemClock, workplaces: gitWorkplaces(systemClock), ids: randomIds, log, restore: { text: restoreText, bytes: restoreBytes } };
}

export function runnerPlugsFor(hook: HookSession, env: Environment, stateDir: string, log: (line: string) => void): RunnerPlugs {
    const lock = new SessionLock(hook.session, { dir: join(stateDir, LOCK_DIR), pid: process.pid, now: Date.now, alive: processAlive, startOf: processStartOf });
    return { lock, followed: followedOf(hook), settle: sleepFor(SETTLE_MS), open: openingOf(hostPlugsFor(hook, env, stateDir, log)), log };
}
