import { must, ok, type Result } from '#src/protocol/result.ts';
import { brand, type Brand } from '#src/recap/domain/brand.ts';
import { parseNonEmptyText, parseText } from '#src/recap/domain/text.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import type { Candidate } from '#src/compaction-timing/contract.ts';

export type SessionKey = Brand<string, 'SessionKey'>;
export type ScopeId = Brand<string, 'ScopeId'>;
export type HarnessKind = Brand<string, 'HarnessKind'>;
export type DecisionId = Brand<string, 'DecisionId'>;
export type CompactionId = Brand<string, 'CompactionId'>;

export interface Placement {
    readonly candidate: Candidate;
    readonly scope: ScopeId;
    readonly key: SessionKey;
    readonly agent: HarnessKind;
}

export function placementOf(candidate: Candidate): Placement {
    return {
        candidate,
        scope: must(parseScopeId(candidate.scope)),
        key: must(parseSessionKey(candidate.key)),
        agent: must(parseHarnessKind(candidate.harness)),
    };
}

export function parseSessionKey(input: unknown): Result<SessionKey, ParseFailure> {
    const text = parseNonEmptyText(input);
    if (text.kind === 'err') {
        return text;
    }
    return ok(brand<string, 'SessionKey'>(text.value));
}

export function parseScopeId(input: unknown): Result<ScopeId, ParseFailure> {
    const text = parseNonEmptyText(input);
    if (text.kind === 'err') {
        return text;
    }
    return ok(brand<string, 'ScopeId'>(text.value));
}

export function parseHarnessKind(input: unknown): Result<HarnessKind, ParseFailure> {
    const text = parseNonEmptyText(input);
    if (text.kind === 'err') {
        return text;
    }
    return ok(brand<string, 'HarnessKind'>(text.value));
}

export function parseDecisionId(input: unknown): Result<DecisionId, ParseFailure> {
    const text = parseText(input);
    if (text.kind === 'err') {
        return text;
    }
    return ok(brand<string, 'DecisionId'>(text.value));
}

export function parseCompactionId(input: unknown): Result<CompactionId, ParseFailure> {
    const text = parseText(input);
    if (text.kind === 'err') {
        return text;
    }
    return ok(brand<string, 'CompactionId'>(text.value));
}
