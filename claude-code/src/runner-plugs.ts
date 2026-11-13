import { join } from 'node:path';
import { createRuntime } from '../../tab-recap/node_modules/@stateforge-labs/harness-adapters/dist/src/runtime/index.js';
import type { Summarizer } from '../../tab-recap/src/ports/summarizer.ts';
import { claudeWriter, followedOf, gitRepos, languageOf, openingOf, systemClock } from './compose.ts';
import type { Environment, HostPlugs } from './compose.ts';
import { DEFAULT_MAX_HOLD_MS, LOCK_DIR, processAlive, SessionLock } from './lock.ts';
import type { HookSession } from './payload.ts';
import { SETTLE_MS, sleepFor } from './runner.ts';
import type { RunnerPlugs } from './runner.ts';

export type HookArgs = { readonly kind: 'hook'; readonly hook: HookSession } | { readonly kind: 'usage' };

export function hookArgsOf(args: readonly string[]): HookArgs {
    const [session = '', records = '', cwd = ''] = args;
    return session === '' || records === '' || cwd === '' ? { kind: 'usage' } : { kind: 'hook', hook: { session, records, cwd } };
}

function onceWriter(env: Environment, log: (line: string) => void): () => Summarizer {
    let made: Summarizer | null = null;
    return (): Summarizer => {
        made ??= claudeWriter(createRuntime(), env, log);
        return made;
    };
}

export function hostPlugsFor(hook: HookSession, env: Environment, stateDir: string, log: (line: string) => void): HostPlugs {
    return { stateDir, records: hook.records, summarizer: onceWriter(env, log), language: () => languageOf(env), clock: systemClock, repos: gitRepos(systemClock), log };
}

export function runnerPlugsFor(hook: HookSession, env: Environment, stateDir: string, log: (line: string) => void): RunnerPlugs {
    const lock = new SessionLock(hook.session, { dir: join(stateDir, LOCK_DIR), pid: process.pid, now: Date.now, alive: processAlive, maxHoldMs: DEFAULT_MAX_HOLD_MS });
    return { lock, followed: followedOf(hook), settle: sleepFor(SETTLE_MS), open: openingOf(hostPlugsFor(hook, env, stateDir, log)), log };
}
