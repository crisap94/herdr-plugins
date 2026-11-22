import { must, ok, type Result } from '#src/protocol/result.ts';
import { brand, type Brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import { parseNonEmptyText, parseText } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';
import type { Candidate } from '@stateforge-labs/session-ledger/compaction-timing';

export type PaneId = Brand<string, 'PaneId'>;
export type TabId = Brand<string, 'TabId'>;
export type AgentKind = Brand<string, 'AgentKind'>;
export type DecisionId = Brand<string, 'DecisionId'>;
export type CompactionId = Brand<string, 'CompactionId'>;

export interface Placement {
    readonly candidate: Candidate;
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly agent: AgentKind;
}

export function placementOf(candidate: Candidate): Placement {
    return {
        candidate,
        tab: must(parseTabId(candidate.scope)),
        pane: must(parsePaneId(candidate.key)),
        agent: must(parseAgentKind(candidate.harness)),
    };
}

export function parsePaneId(input: unknown): Result<PaneId, ParseFailure> {
    const text = parseNonEmptyText(input);
    if (text.kind === 'err') {
        return text;
    }
    return ok(brand<string, 'PaneId'>(text.value));
}

export function parseTabId(input: unknown): Result<TabId, ParseFailure> {
    const text = parseNonEmptyText(input);
    if (text.kind === 'err') {
        return text;
    }
    return ok(brand<string, 'TabId'>(text.value));
}

export function parseAgentKind(input: unknown): Result<AgentKind, ParseFailure> {
    const text = parseNonEmptyText(input);
    if (text.kind === 'err') {
        return text;
    }
    return ok(brand<string, 'AgentKind'>(text.value));
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
