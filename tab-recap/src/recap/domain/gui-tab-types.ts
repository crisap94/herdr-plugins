import { err, ok, type Result } from '#src/protocol/result.ts';
import type { Count } from './count.ts';
import type { Directory } from './directory.ts';
import { isFields } from './fields.ts';
import type { AgentKind, PaneId, TabId } from './ids.ts';
import type { ParseFailure } from './parse-failure.ts';
import type { GuiBreak, GuiCompaction, GuiContext, GuiCut, GuiFact, GuiGit, GuiGroup, GuiNote, GuiRegions, GuiSession, GuiStory, GuiTimelineRow, GuiVersions, GuiWeb, Flag, GuiLocale } from './gui-tab-parts.ts';
import type { NonEmptyText, Text } from './text.ts';
import type { Instant } from './time.ts';

export const GUI_TAB_VERSION = 2;
export const GUI_TAB_V1 = 1;

export type GuiWriting = 'writing' | 'resting';

export interface GuiSectionsV1 {
    readonly goal: Text;
    readonly now: readonly Text[];
    readonly needs: readonly Text[];
    readonly done: readonly Text[];
    readonly decisions: readonly Text[];
    readonly next: readonly Text[];
    readonly links: readonly Text[];
}

export interface GuiSections extends GuiSectionsV1 {
    readonly rules: readonly Text[];
}

export interface GuiTaskV1 {
    readonly id: NonEmptyText;
    readonly name: Text;
    readonly sections: GuiSectionsV1;
    readonly markdown: Text;
}

export interface GuiTask extends GuiTaskV1 {
    readonly sections: GuiSections;
    readonly facts: readonly GuiFact[];
    readonly regions: GuiRegions;
    readonly timeline: readonly GuiTimelineRow[];
    readonly story: GuiStory | null;
    readonly curating: Flag;
    readonly needsWaitedMs: readonly Count[];
}

export interface GuiLaneV1 {
    readonly pane: PaneId;
    readonly agent: AgentKind;
    readonly status: NonEmptyText;
    readonly title: Text | null;
    readonly cwd: Directory | null;
    readonly lastPrompt: Text | null;
    readonly branch: Text | null;
    readonly contextPercent: Count | null;
    readonly since: Instant | null;
}

export interface GuiLane extends GuiLaneV1 {
    readonly heading: Text;
    readonly fromScreen: Flag;
    readonly context: GuiContext | null;
    readonly compaction: GuiCompaction;
    readonly notes: readonly GuiNote[];
    readonly git: GuiGit | null;
    readonly web: GuiWeb | null;
}

export interface GuiTabV1 {
    readonly version: typeof GUI_TAB_V1;
    readonly tab: TabId;
    readonly name: NonEmptyText;
    readonly status: NonEmptyText;
    readonly at: Instant;
    readonly recapAt: Instant | null;
    readonly writing: GuiWriting;
    readonly error: Text | null;
    readonly lanes: readonly GuiLaneV1[];
    readonly tasks: readonly GuiTaskV1[];
}

export interface GuiTab extends Omit<GuiTabV1, 'version' | 'lanes' | 'tasks'> {
    readonly version: typeof GUI_TAB_VERSION;
    readonly lanes: readonly GuiLane[];
    readonly tasks: readonly GuiTask[];
    readonly locale: GuiLocale;
    readonly zone: Text;
    readonly compactHint: Count | null;
    readonly backend: Text | null;
    readonly versions: GuiVersions;
    readonly warnings: readonly Text[];
    readonly claudeRecaps: readonly Text[];
    readonly groups: readonly GuiGroup[];
    readonly breaks: readonly GuiBreak[];
    readonly session: GuiSession | null;
    readonly cuts: readonly GuiCut[];
}

export type GuiVersion = typeof GUI_TAB_V1 | typeof GUI_TAB_VERSION;

export function parseGuiVersion(input: unknown): Result<GuiVersion, ParseFailure> {
    const found = isFields(input) ? input['version'] : undefined;
    if (found === GUI_TAB_V1) { return ok(GUI_TAB_V1); }
    return found === GUI_TAB_VERSION ? ok(GUI_TAB_VERSION) : err({ kind: 'out-of-range' });
}

export function parseGuiWriting(input: unknown): Result<GuiWriting, ParseFailure> {
    return input === 'writing' || input === 'resting' ? ok(input) : err({ kind: 'out-of-range' });
}
