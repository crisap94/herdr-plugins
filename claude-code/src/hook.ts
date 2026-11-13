import type { RestoreFacts } from '../../tab-recap/src/recap/application/engine.ts';
import { restoreContentOf } from '../../tab-recap/src/recap/application/restore-text.ts';
import { clean } from '../../tab-recap/src/recap/application/compaction-brief.ts';
import { guidanceOf } from '../../tab-recap/src/recap/application/compaction-message.ts';
import { byteBudgetOf } from '../../tab-recap/src/recap/domain/byte-budget.ts';
import { sectionsOfOpen } from '../../tab-recap/src/recap/domain/ledger-view.ts';
import { NO_SECTIONS } from '../../tab-recap/src/recap/domain/shape.ts';
import { fitRestore } from '../../tab-recap/src/recap/render/restore-markdown.ts';
import type { Clock } from '../../tab-recap/src/ports/clock.ts';
import { followedOf, recordsMatchSession } from './compose.ts';
import type { Environment } from './compose.ts';
import { parsePayload } from './payload.ts';
import type { HookSession, HostEvent } from './payload.ts';
import { readingWith } from './read.ts';

export const HOOK_SETTINGS = {
    headless: 'SESSION_LEDGER_HEADLESS',
    precompact: 'SESSION_LEDGER_PRECOMPACT',
    runner: 'SESSION_LEDGER_RUNNER',
} as const;

export const CONTEXT_BUDGET_BYTES = 9000;

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

export function restoreFitted(facts: RestoreFacts): string {
    const content = restoreContentOf(facts);
    const fitted = content.kind === 'content' ? fitRestore(content, byteBudgetOf(CONTEXT_BUDGET_BYTES)) : null;
    return fitted?.kind === 'text' ? fitted.text : '';
}

export function briefOf(facts: RestoreFacts): string {
    if (facts.lastRun === null) {
        return '';
    }
    const sections = clean(sectionsOfOpen(facts.open), '');
    const empty = JSON.stringify(sections) === JSON.stringify(NO_SECTIONS);
    return empty ? '' : guidanceOf({ sections, web: null, note: null });
}

export const contextJson = (text: string): string => JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } });

export function factsOf(hook: HookSession, deps: Pick<HookDeps, 'stateDir' | 'clock' | 'log'>, shape: (facts: RestoreFacts) => string): string {
    const followed = followedOf(hook);
    return readingWith(deps.stateDir, deps.clock, deps.log, (engine) => shape(engine.restore(followed.scope, followed.session)), '');
}

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
            const text = factsOf(event, deps, restoreFitted);
            return text === '' ? SILENT : { kind: 'print', text: contextJson(text) };
        }
        case 'PreCompact':
            return switchedOn(deps.env, HOOK_SETTINGS.precompact) ? printed(factsOf(event, deps, briefOf)) : SILENT;
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
