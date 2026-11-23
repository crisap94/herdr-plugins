import type { ClosedWhy } from '@stateforge-labs/session-ledger';
import type { Brand } from './kernel.ts';

export type Locale = 'en' | 'es';
export type AgoUnit = 's' | 'min' | 'h' | 'd';
export type Count = Brand<number, 'Count'>;
export type Amount = Brand<number, 'Amount'>;
export type Percent = Brand<number, 'Percent'>;
export type Seconds = Brand<number, 'Seconds'>;
export type Minutes = Brand<number, 'Minutes'>;
export type Words = Brand<string, 'Words'>;
export type WordsOrNull = Words | null;

export function assertWords(input: unknown): asserts input is Words {
    if (typeof input !== 'string') {
        throw new TypeError('words are a string');
    }
}

export function parseWords(input: unknown): Words {
    assertWords(input);
    return input;
}

export function parseWordsOrNull(input: unknown): WordsOrNull {
    return input === null ? null : parseWords(input);
}

export function assertCount(input: unknown): asserts input is Count {
    if (typeof input !== 'number') {
        throw new TypeError('a count is a number');
    }
}

export function parseCount(input: unknown): Count {
    assertCount(input);
    return input;
}

export function parsePercent(input: unknown): Percent {
    assertPercent(input);
    return input;
}

export function assertAmount(input: unknown): asserts input is Amount {
    if (typeof input !== 'number') {
        throw new TypeError('an amount is a number');
    }
}

export function assertPercent(input: unknown): asserts input is Percent {
    if (typeof input !== 'number') {
        throw new TypeError('a percent is a number');
    }
}

export function assertSeconds(input: unknown): asserts input is Seconds {
    if (typeof input !== 'number') {
        throw new TypeError('a seconds is a number');
    }
}

export function assertMinutes(input: unknown): asserts input is Minutes {
    if (typeof input !== 'number') {
        throw new TypeError('a minutes is a number');
    }
}

export interface BadgeWording<Text> {
    readonly working: Text;
    readonly blocked: Text;
    readonly idle: Text;
    readonly done: Text;
    readonly unknown: Text;
}

export interface HintWording<Text> {
    readonly column: readonly Text[];
    readonly modal: readonly Text[];
}

export interface CompactionStageWording<Text> {
    readonly queued: (agent: WordsOrNull, clock: Words) => Text;
    readonly briefing: (agent: WordsOrNull, writer: WordsOrNull, clock: Words) => Text;
    readonly compacting: (agent: WordsOrNull, clock: Words) => Text;
    readonly restoring: (agent: WordsOrNull) => Text;
    readonly compacted: (agent: WordsOrNull, figures: Words) => Text;
    readonly template: Text;
    readonly failed: (agent: WordsOrNull, why: WordsOrNull) => Text;
    readonly unconfirmed: (agent: WordsOrNull, why: WordsOrNull) => Text;
    readonly skipped: (agent: WordsOrNull, why: WordsOrNull) => Text;
    readonly tokens: (before: Words, after: Words) => Text;
    readonly took: (seconds: Seconds) => Text;
}

export interface CompactionWording<Text> {
    readonly hint: (percent: Percent, window: Words) => Text;
    readonly stage: CompactionStageWording<Text>;
}

export interface CauseWording<Text> {
    readonly 'turn-ended': Text;
    readonly focused: Text;
    readonly requested: Text;
}

export interface OriginWording<Text> {
    readonly operator: (count: Count) => Text;
    readonly auto: (count: Count) => Text;
}

export interface AutocompactWording<Text> {
    readonly label: Text;
    readonly text: (decisions: Count, compacted: Count, waited: Count) => Text;
}

export interface ExpandedWording<Text> {
    readonly timeline: Text;
    readonly rules: Text;
    readonly session: Text;
    readonly story: Text;
    readonly updatingStory: Text;
    readonly waiting: (amount: Amount, unit: AgoUnit) => Text;
    readonly closed: (why: ClosedWhy) => Text;
    readonly started: Text;
    readonly turns: Text;
    readonly compactions: Text;
    readonly compactionOrigin: OriginWording<Text>;
    readonly of: Text;
    readonly repo: Text;
    readonly branch: Text;
    readonly files: Text;
    readonly causes: CauseWording<Text>;
    readonly autocompact: AutocompactWording<Text>;
}

export interface ChaptersWording<Text> {
    readonly label: Text;
    readonly count: (chapters: Count) => Text;
    readonly compacted: Text;
    readonly newSession: Text;
    readonly seconds: (seconds: Seconds) => Text;
    readonly minutes: (minutes: Minutes, seconds: Seconds) => Text;
}

export interface Wording<Text> {
    readonly locale: Locale;
    readonly badge: BadgeWording<Text>;
    readonly waitingForAgent: Text;
    readonly fromScreen: Text;
    readonly recapTitle: Text;
    readonly taskNumber: (n: Count) => Text;
    readonly updating: Text;
    readonly daemonStale: (daemon: WordsOrNull) => Text;
    readonly claudeOwn: Text;
    readonly noRecapYet: Text;
    readonly noRecapShort: Text;
    readonly allDoneShort: Text;
    readonly recapError: (error: Words) => Text;
    readonly needsYou: (what: Words) => Text;
    readonly ago: (amount: Amount, unit: AgoUnit) => Text;
    readonly hints: HintWording<Text>;
    readonly compaction: CompactionWording<Text>;
    readonly expanded: ExpandedWording<Text>;
    readonly chapters: ChaptersWording<Text>;
}

export interface TextWording extends Wording<string> {}

export interface TextChapters extends ChaptersWording<string> {}
