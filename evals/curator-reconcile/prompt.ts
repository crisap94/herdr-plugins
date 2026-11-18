import { readFileSync } from 'node:fs';
import { RECONCILE_CURATOR_INSTRUCTIONS } from '../../tab-recap/src/adapters/job/prompts/curator-reconcile-instructions.ts';
import { RUBRIC } from '../../tab-recap/src/adapters/job/prompts/rubric.ts';
import type { Entry } from '../../packages/session-ledger/src/ports/transcripts.ts';
import { reconcileInput } from '../../packages/session-ledger/src/recap/application/curator-input.ts';
import type { TaskGround } from '../../packages/session-ledger/src/recap/application/ops-gating.ts';
import type { Fact } from '../../packages/session-ledger/src/recap/domain/fact.ts';
import type { Item, Prompt } from '../lib/types.ts';

export interface Spanned {
    readonly id: string;
    readonly span: string;
}

export interface Input {
    readonly name: string;
    readonly language: string;
    readonly clock: { readonly now: number; readonly zone: string };
    readonly open: readonly Fact[];
    readonly tail: readonly Entry[];
}

export interface Expected {
    readonly must_close: readonly { readonly id: string; readonly why: readonly string[]; readonly evidence: string }[];
    readonly must_update: readonly { readonly id: string; readonly text: string; readonly evidence: string }[];
    readonly must_stay_open: readonly string[];
    readonly duplicates: readonly (readonly string[])[];
    readonly summary_turns: readonly number[];
    readonly summary_spans: readonly string[];
    readonly summary_claims: readonly Spanned[];
    readonly lookalikes: readonly Spanned[];
    readonly note: string;
}

export interface ReconcileItem extends Item<Input, Expected> {
    readonly tags: readonly string[];
}

export interface Built {
    readonly document: string;
    readonly facts: ReadonlyMap<string, Fact>;
    readonly tail: string;
}

export const SYSTEM: string = RECONCILE_CURATOR_INSTRUCTIONS;

const cache = new Map<string, Built>();

export function builtOf(item: ReconcileItem): Built {
    const found = cache.get(item.id);
    if (found !== undefined) return found;
    const built = reconcileInput({ ...item.input, rubric: RUBRIC.items });
    cache.set(item.id, built);
    return built;
}

export function groundOf(item: ReconcileItem): TaskGround {
    const built = builtOf(item);
    return { key: 'k', tab: 't', shown: built.facts, open: [...built.facts.values()], closedLately: [], source: '', language: item.input.language, agents: ['claude', item.input.name.toLowerCase()] };
}

export function prompt(item: ReconcileItem): Prompt {
    return { system: SYSTEM, user: builtOf(item).document };
}

export function loadItems(file: string): ReconcileItem[] {
    return readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line) as ReconcileItem);
}
