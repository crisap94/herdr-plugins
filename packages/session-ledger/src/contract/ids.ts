import { err, ok, type Brand, type ParseFailure, type Result } from './kernel.ts';

export type ScopeId = Brand<string, 'ScopeId'>;
export type SessionKey = Brand<string, 'SessionKey'>;
export type SessionId = Brand<string, 'SessionId'>;
export type HarnessKind = Brand<string, 'HarnessKind'>;
export type RestoreText = Brand<string, 'RestoreText'>;
export type Directory = Brand<string, 'Directory'>;

export function parseScopeId(input: unknown): Result<ScopeId, ParseFailure> {
    if (typeof input !== 'string') {
        return err({ kind: 'not-a-string' });
    }
    if (input.trim() === '') {
        return err({ kind: 'empty' });
    }
    return ok(input as ScopeId);
}

export function parseSessionKey(input: unknown): Result<SessionKey, ParseFailure> {
    if (typeof input !== 'string') {
        return err({ kind: 'not-a-string' });
    }
    if (input.trim() === '') {
        return err({ kind: 'empty' });
    }
    return ok(input as SessionKey);
}

export function parseHarnessKind(input: unknown): Result<HarnessKind, ParseFailure> {
    if (typeof input !== 'string') {
        return err({ kind: 'not-a-string' });
    }
    if (input.trim() === '') {
        return err({ kind: 'empty' });
    }
    return ok(input as HarnessKind);
}

export function parseSessionId(input: unknown): Result<SessionId, ParseFailure> {
    if (typeof input !== 'string') {
        return err({ kind: 'not-a-string' });
    }
    if (input.trim() === '') {
        return err({ kind: 'empty' });
    }
    return ok(input as SessionId);
}

export function parseDirectory(input: unknown): Result<Directory, ParseFailure> {
    if (typeof input !== 'string') {
        return err({ kind: 'not-a-string' });
    }
    if (input.trim() === '') {
        return err({ kind: 'empty' });
    }
    return ok(input as Directory);
}
