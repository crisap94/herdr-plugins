import {
    parseHarnessKind,
    parseScopeId,
    parseSessionId,
    parseSessionKey,
    type FollowedSession,
    type HarnessKind,
    type ParseFailure,
    type Result,
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

export function followed(sessionKey: SessionKey, over: Partial<Omit<FollowedSession, 'key'>> = {}): FollowedSession {
    return { key: sessionKey, harness: harness('claude'), session: null, cwd: null, title: null, ...over };
}
