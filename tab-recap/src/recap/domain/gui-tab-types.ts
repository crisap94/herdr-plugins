import { err, ok, type Result } from '#src/protocol/result.ts';
import { parseCount, type Count } from './count.ts';
import { parseDirectory, type Directory } from './directory.ts';
import { isFields } from './hc-terminal.ts';
import { parseAgentKind, parsePaneId, parseTabId, type AgentKind, type PaneId, type TabId } from './ids.ts';
import type { ParseFailure } from './parse-failure.ts';
import type { GuiBreak, GuiCompaction, GuiContext, GuiCut, GuiFact, GuiGit, GuiGroup, GuiNote, GuiRegions, GuiSession, GuiStory, GuiTimelineRow, GuiVersions, GuiWeb, Flag, GuiLocale } from './gui-tab-parts.ts';
import { parseNonEmptyText, parseText, type NonEmptyText, type Text } from './text.ts';
import { parseInstant, type Instant } from './time.ts';

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

export type GuiTabAny = GuiTabV1 | GuiTab;


export type GuiVersion = typeof GUI_TAB_V1 | typeof GUI_TAB_VERSION;

export type Texts = readonly Text[];

export type GuiLanesV1 = readonly GuiLaneV1[];

export type GuiTasksV1 = readonly GuiTaskV1[];

const orNull = <T>(result: Result<T, ParseFailure>): T | null => (result.kind === 'ok' ? result.value : null);

export function parseTexts(input: unknown): Texts {
    return Array.isArray(input) ? input.flatMap((item) => orNull(parseText(item)) ?? []) : [];
}

export function parseGuiVersion(input: unknown): Result<GuiVersion, ParseFailure> {
    const found = isFields(input) ? input['version'] : undefined;
    if (found === GUI_TAB_V1) { return ok(GUI_TAB_V1); }
    return found === GUI_TAB_VERSION ? ok(GUI_TAB_VERSION) : err({ kind: 'out-of-range' });
}

export function parseGuiWriting(input: unknown): Result<GuiWriting, ParseFailure> {
    return input === 'writing' || input === 'resting' ? ok(input) : err({ kind: 'out-of-range' });
}

export function parseGuiSectionsV1(input: unknown): Result<GuiSectionsV1, ParseFailure> {
    if (!isFields(input)) { return err({ kind: 'not-a-row' }); }
    const goal = parseText(input['goal']);
    if (goal.kind === 'err') { return goal; }
    return ok({ goal: goal.value, now: parseTexts(input['now']), needs: parseTexts(input['needs']), done: parseTexts(input['done']), decisions: parseTexts(input['decisions']), next: parseTexts(input['next']), links: parseTexts(input['links']) });
}

export function parseGuiTaskV1(input: unknown): Result<GuiTaskV1, ParseFailure> {
    if (!isFields(input)) { return err({ kind: 'not-a-row' }); }
    const id = parseNonEmptyText(input['id']);
    const name = parseText(input['name']);
    const sections = parseGuiSectionsV1(input['sections']);
    const markdown = parseText(input['markdown']);
    if (id.kind === 'err') { return id; }
    if (name.kind === 'err') { return name; }
    if (sections.kind === 'err') { return sections; }
    return markdown.kind === 'err' ? markdown : ok({ id: id.value, name: name.value, sections: sections.value, markdown: markdown.value });
}

export function parseGuiLaneV1(input: unknown): Result<GuiLaneV1, ParseFailure> {
    if (!isFields(input)) { return err({ kind: 'not-a-row' }); }
    const pane = parsePaneId(input['pane']);
    const agent = parseAgentKind(input['agent']);
    const status = parseNonEmptyText(input['status']);
    if (pane.kind === 'err') { return pane; }
    if (agent.kind === 'err') { return agent; }
    if (status.kind === 'err') { return status; }
    return ok({
        pane: pane.value, agent: agent.value, status: status.value, title: orNull(parseText(input['title'])), cwd: orNull(parseDirectory(input['cwd'])), lastPrompt: orNull(parseText(input['lastPrompt'])),
        branch: orNull(parseText(input['branch'])), contextPercent: orNull(parseCount(input['contextPercent'])), since: orNull(parseInstant(input['since'])),
    });
}

export function parseGuiLanesV1(input: unknown): GuiLanesV1 {
    return Array.isArray(input) ? input.flatMap((item) => orNull(parseGuiLaneV1(item)) ?? []) : [];
}

export function parseGuiTasksV1(input: unknown): GuiTasksV1 {
    return Array.isArray(input) ? input.flatMap((item) => orNull(parseGuiTaskV1(item)) ?? []) : [];
}

export function parseGuiTabV1(input: unknown): Result<GuiTabV1, ParseFailure> {
    if (!isFields(input)) { return err({ kind: 'not-a-row' }); }
    const tab = parseTabId(input['tab']);
    const name = parseNonEmptyText(input['name']);
    const status = parseNonEmptyText(input['status']);
    const at = parseInstant(input['at']);
    const writing = parseGuiWriting(input['writing']);
    if (tab.kind === 'err') { return tab; }
    if (name.kind === 'err') { return name; }
    if (status.kind === 'err') { return status; }
    if (at.kind === 'err') { return at; }
    if (writing.kind === 'err') { return writing; }
    return ok({
        version: GUI_TAB_V1, tab: tab.value, name: name.value, status: status.value, at: at.value, recapAt: orNull(parseInstant(input['recapAt'])), writing: writing.value,
        error: orNull(parseText(input['error'])), lanes: parseGuiLanesV1(input['lanes']), tasks: parseGuiTasksV1(input['tasks']),
    });
}
