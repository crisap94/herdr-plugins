import {
    parseDirectory,
    parseHarnessKind,
    parseScopeId,
    parseSessionId,
    parseSessionKey,
    type Directory,
    type Duration,
    type FollowedSession,
    type HarnessKind,
    type ParseFailure,
    type Result,
    type RestoreText,
    type ScopeId,
    type SessionId,
    type SessionKey,
} from '@stateforge-labs/session-ledger';

const unwrap = <T>(result: Result<T, ParseFailure>): T => {
    if (result.kind === 'err') {
        throw new Error(`testkit: the identifier is refused (${result.error.kind})`);
    }
    return result.value;
};

export const scope = (text: string): ScopeId => unwrap(parseScopeId(text));

export const key = (text: string): SessionKey => unwrap(parseSessionKey(text));

export const session = (text: string): SessionId => unwrap(parseSessionId(text));

export const harness = (text: string): HarnessKind => unwrap(parseHarnessKind(text));

export const directory = (text: string): Directory => unwrap(parseDirectory(text));

const isDuration = (ms: number): ms is Duration => Number.isSafeInteger(ms) && ms >= 0;

export const duration = (ms: number): Duration => {
    if (isDuration(ms)) {
        return ms;
    }
    throw new Error('testkit: a duration is a whole number of milliseconds, zero or more');
};

const isRestore = (text: string): text is RestoreText => typeof text === 'string';

export const restore = (text: string): RestoreText => {
    if (isRestore(text)) {
        return text;
    }
    throw new Error('testkit: a restore text is a string');
};

export function followed(sessionKey: SessionKey, over: Partial<Omit<FollowedSession, 'key'>> = {}): FollowedSession {
    return { key: sessionKey, harness: harness('claude'), session: null, cwd: null, title: null, ...over };
}
