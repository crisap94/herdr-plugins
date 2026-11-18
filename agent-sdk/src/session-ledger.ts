import {
    parseDirectory,
    parseHarnessKind,
    parseScopeId,
    parseSessionId,
    parseSessionKey,
    type Directory,
    type Engine,
    type ParseFailure,
    type Result,
    type ScopeId,
    type SessionKey,
} from '@stateforge-labs/session-ledger';

export type HookEventName = 'SessionStart' | 'SessionEnd' | 'Stop' | 'PostCompact';

export interface HookInput {
    readonly hook_event_name: string;
    readonly session_id: string;
    readonly cwd?: string;
    readonly source?: string;
}

export interface SessionStartOutput {
    readonly hookEventName: 'SessionStart';
    readonly additionalContext: string;
}

export interface HookOutput {
    readonly hookSpecificOutput?: SessionStartOutput;
}

export type HookCallback = (input: HookInput) => Promise<HookOutput>;

export interface HookMatcher {
    hooks: HookCallback[];
}

export type HookSet = Partial<Record<HookEventName, HookMatcher[]>>;

export interface SessionLedgerSettings {
    readonly scopeOf?: (sessionId: string) => ScopeId;
}

export interface SessionLedger {
    readonly hooks: HookSet;
    readonly env: Readonly<Record<string, string>>;
    settled(): Promise<void>;
    close(): Promise<void>;
}

type Environment = Readonly<Record<string, string | undefined>>;

interface Followed {
    readonly scope: ScopeId;
    readonly key: SessionKey;
}

const EVENTS: readonly HookEventName[] = ['SessionStart', 'SessionEnd', 'Stop', 'PostCompact'];

const must = <T>(result: Result<T, ParseFailure>, what: string): T => {
    if (result.kind === 'err') {
        throw new Error(`agent-sdk: invalid ${what}`);
    }
    return result.value;
};

const directoryOf = (cwd: string | undefined): Directory | null => {
    if (cwd === undefined) {
        return null;
    }
    const parsed = parseDirectory(cwd);
    return parsed.kind === 'ok' ? parsed.value : null;
};

const isWriterElsewhere = (environment: Environment): boolean =>
    environment.HERDR_ENV === '1' || environment.SESSION_LEDGER_WRITER === '1';

const defaultScope = (sessionId: string): ScopeId => must(parseScopeId(`agent-sdk:${sessionId}`), 'scope');

export function createSessionLedger(
    engine: Engine,
    settings: SessionLedgerSettings = {},
    environment: Environment = {},
): SessionLedger {
    if (isWriterElsewhere(environment)) {
        return { hooks: {}, env: {}, settled: () => Promise.resolve(), close: () => Promise.resolve() };
    }
    const scopeOf = settings.scopeOf ?? defaultScope;
    const followed = new Map<string, Followed>();

    const ensureFollowed = (input: HookInput): Followed => {
        const existing = followed.get(input.session_id);
        if (existing !== undefined) {
            return existing;
        }
        const scope = scopeOf(input.session_id);
        const key = must(parseSessionKey(input.session_id), 'session key');
        engine.follow(scope, {
            key,
            harness: must(parseHarnessKind('claude'), 'harness'),
            session: must(parseSessionId(input.session_id), 'session id'),
            cwd: directoryOf(input.cwd),
            title: null,
        });
        const entry = { scope, key };
        followed.set(input.session_id, entry);
        return entry;
    };

    const matcher = (run: (input: HookInput, entry: Followed) => HookOutput): HookMatcher => ({
        hooks: [async (input) => run(input, ensureFollowed(input))],
    });

    const hooks: HookSet = {
        SessionStart: [
            matcher((input, entry) => {
                engine.sessionStarted(entry.scope, entry.key, {
                    session: must(parseSessionId(input.session_id), 'session id'),
                    cwd: directoryOf(input.cwd),
                });
                if (input.source !== 'compact' && input.source !== 'resume') {
                    return {};
                }
                const text = engine.compacted(entry.scope, entry.key);
                return text === ''
                    ? {}
                    : { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } };
            }),
        ],
        Stop: [
            matcher((_input, entry) => {
                engine.turnEnded(entry.scope, entry.key, 'turn-ended');
                return {};
            }),
        ],
        PostCompact: [
            matcher((_input, entry) => {
                engine.turnEnded(entry.scope, entry.key, 'turn-ended');
                return {};
            }),
        ],
        SessionEnd: [
            matcher((input, entry) => {
                engine.unfollow(entry.scope, entry.key);
                followed.delete(input.session_id);
                return {};
            }),
        ],
    };

    return {
        hooks,
        env: { SESSION_LEDGER_WRITER: '1' },
        settled: async () => {
            await Promise.all([...followed.values()].map((entry) => engine.refresh(entry.scope)));
        },
        close: async () => {
            for (const entry of followed.values()) {
                engine.unfollow(entry.scope, entry.key);
            }
            followed.clear();
        },
    };
}

export function mergeHooks(...sets: readonly HookSet[]): HookSet {
    const merged: HookSet = {};
    for (const set of sets) {
        for (const event of EVENTS) {
            const matchers = set[event];
            if (matchers !== undefined) {
                merged[event] = [...(merged[event] ?? []), ...matchers];
            }
        }
    }
    return merged;
}
