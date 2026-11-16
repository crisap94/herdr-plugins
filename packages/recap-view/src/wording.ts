import type { ClosedWhy } from '@stateforge-labs/session-ledger';
import type { Brand } from './kernel.ts';

export type Locale = 'en' | 'es';
export type AgoUnit = 's' | 'min' | 'h' | 'd';
export type Count = Brand<number, 'Count'>;
export type Amount = Brand<number, 'Amount'>;
export type Percent = Brand<number, 'Percent'>;
export type Seconds = Brand<number, 'Seconds'>;
export type Minutes = Brand<number, 'Minutes'>;

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
    readonly queued: (agent: Text | null, clock: Text) => Text;
    readonly briefing: (agent: Text | null, writer: Text | null, clock: Text) => Text;
    readonly compacting: (agent: Text | null, clock: Text) => Text;
    readonly restoring: (agent: Text | null) => Text;
    readonly compacted: (agent: Text | null, figures: Text) => Text;
    readonly template: Text;
    readonly failed: (agent: Text | null, why: Text | null) => Text;
    readonly unconfirmed: (agent: Text | null, why: Text | null) => Text;
    readonly skipped: (agent: Text | null, why: Text | null) => Text;
    readonly tokens: (before: Text, after: Text) => Text;
    readonly took: (seconds: Seconds) => Text;
}

export interface CompactionWording<Text> {
    readonly hint: (percent: Percent, window: Text) => Text;
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
    readonly daemonStale: (daemon: Text | null) => Text;
    readonly claudeOwn: Text;
    readonly noRecapYet: Text;
    readonly noRecapShort: Text;
    readonly recapError: (error: Text) => Text;
    readonly needsYou: (what: Text) => Text;
    readonly ago: (amount: Amount, unit: AgoUnit) => Text;
    readonly hints: HintWording<Text>;
    readonly compaction: CompactionWording<Text>;
    readonly expanded: ExpandedWording<Text>;
    readonly chapters: ChaptersWording<Text>;
}
