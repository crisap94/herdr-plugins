import type { Clock } from '@stateforge-labs/session-ledger';
import { followedOf, recordsMatchSession } from './compose.ts';
import { briefOf } from './plugs.ts';
import type { Environment } from './plugs.ts';
import { parsePayload } from './payload.ts';
import type { HookSession, HostEvent } from './payload.ts';
import { readingWith } from './read.ts';
import type { ReadEngine } from './read.ts';

export const HOOK_SETTINGS = {
    headless: 'SESSION_LEDGER_HEADLESS',
    precompact: 'SESSION_LEDGER_PRECOMPACT',
    runner: 'SESSION_LEDGER_RUNNER',
} as const;

export interface HookDeps {
    readonly env: Environment;
    readonly stateDir: string;
    readonly clock: Clock;
    readonly log: (line: string) => void;
    readonly startRunner: (hook: HookSession) => void;
}

export type HookAnswer = { readonly kind: 'silent' } | { readonly kind: 'print'; readonly text: string };

const SILENT: HookAnswer = { kind: 'silent' };

export const switchedOn = (env: Environment, key: string): boolean => env[key]?.trim().toLowerCase() === 'on';

export const contextJson = (text: string): string => JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } });

function textOf(deps: HookDeps, shape: (reading: ReadEngine) => string): string {
    return readingWith(deps.stateDir, deps.clock, deps.log, shape, '');
}

const compactedText = (event: HostEvent): ((reading: ReadEngine) => string) => (reading) => {
    const followed = followedOf(event);
    reading.engine.follow(followed.scope, followed.session);
    return reading.engine.compacted(followed.scope, followed.session.key);
};

const briefText = (event: HostEvent): ((reading: ReadEngine) => string) => (reading) => {
    const followed = followedOf(event);
    reading.engine.follow(followed.scope, followed.session);
    return briefOf(reading.openFacts(followed.scope, followed.session.key), reading.records.lastRunOf(followed.scope));
};

const printed = (text: string): HookAnswer => (text === '' ? SILENT : { kind: 'print', text });

function started(event: HostEvent, deps: HookDeps): HookAnswer {
    if (!recordsMatchSession(event)) {
        deps.log(`${event.name} of ${event.session}: the transcript ${event.records} is not named after the session; not followed`);
        return SILENT;
    }
    deps.startRunner({ session: event.session, records: event.records, cwd: event.cwd });
    return SILENT;
}

function answerTo(event: HostEvent, deps: HookDeps): HookAnswer {
    switch (event.name) {
        case 'Stop':
        case 'PostCompact':
            return started(event, deps);
        case 'SessionStart': {
            if (event.source !== 'compact' && event.source !== 'resume') {
                return SILENT;
            }
            const text = textOf(deps, compactedText(event));
            return text === '' ? SILENT : { kind: 'print', text: contextJson(text) };
        }
        case 'PreCompact':
            return switchedOn(deps.env, HOOK_SETTINGS.precompact) ? printed(textOf(deps, briefText(event))) : SILENT;
        default: {
            const exhaustive: never = event;
            return exhaustive;
        }
    }
}

export function answerOf(expected: string, payload: string, deps: HookDeps): HookAnswer {
    const parsed = parsePayload(payload);
    if (parsed.kind === 'refused') {
        deps.log(`${expected}: payload refused (${parsed.why}: ${parsed.detail})`);
        return SILENT;
    }
    if (parsed.event.name !== expected) {
        deps.log(`${expected}: the payload is a ${parsed.event.name}; nothing done`);
        return SILENT;
    }
    return answerTo(parsed.event, deps);
}
