import { readFileSync } from 'node:fs';
import { RECONCILE_CURATOR_INSTRUCTIONS } from '../../tab-recap/src/adapters/job/prompts/curator-reconcile-instructions.ts';
import { RUBRIC } from '../../tab-recap/src/adapters/job/prompts/rubric.ts';
import type { Entry } from '../../packages/session-ledger/src/ports/transcripts.ts';
import { reconcileInput, type ReconcileMaterial } from '../../packages/session-ledger/src/recap/application/curator-input.ts';
import type { TaskGround } from '../../packages/session-ledger/src/recap/application/ops-gating.ts';
import type { Fact } from '../../packages/session-ledger/src/recap/domain/fact.ts';
import type { Item, Prompt } from '../lib/types.ts';
import { factOfStored, factToStored, type StoredFact } from '../lib/stored-fact.ts';
import { brand } from '../../packages/session-ledger/src/recap/domain/brand.ts';
import { instant } from '../../packages/session-ledger/src/recap/domain/time.ts';
import type { Text } from '../../packages/session-ledger/src/recap/domain/text.ts';

const textOf = brand<string, 'Text'>;

export function materialOf(input: Input): ReconcileMaterial {
    return { ...input, name: textOf(input.name), language: textOf(input.language), rubric: RUBRIC.items, clock: { now: instant(input.clock.now), zone: textOf(input.clock.zone) } };
}

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
    readonly facts: ReadonlyMap<Text, Fact>;
    readonly tail: string;
}

export const SYSTEM: string = RECONCILE_CURATOR_INSTRUCTIONS;

const cache = new Map<string, Built>();

export function builtOf(item: ReconcileItem): Built {
    const found = cache.get(item.id);
    if (found !== undefined) return found;
    const built = reconcileInput(materialOf(item.input));
    cache.set(item.id, built);
    return built;
}

export function groundOf(item: ReconcileItem): TaskGround {
    const built = builtOf(item);
    return { key: textOf('k'), scope: textOf('t'), shown: new Map([...built.facts].map(([id, fact]) => [textOf(id), fact])), open: [...built.facts.values()], closedLately: [], source: textOf(''), language: textOf(item.input.language), agents: [textOf('claude'), textOf(item.input.name.toLowerCase())] };
}

export function prompt(item: ReconcileItem): Prompt {
    return { system: SYSTEM, user: builtOf(item).document };
}

export type StoredInput = Omit<Input, 'open'> & { readonly open: readonly StoredFact[] };

export const inputOfStored = (input: StoredInput): Input => ({ ...input, open: input.open.map(factOfStored) });

export const inputToStored = (input: Input): StoredInput => ({ ...input, open: input.open.map(factToStored) });

export function loadItems(file: string): ReconcileItem[] {
    return readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '').map((line) => {
        const item = JSON.parse(line) as Omit<ReconcileItem, 'input'> & { readonly input: StoredInput };
        return { ...item, input: inputOfStored(item.input) };
    });
}
