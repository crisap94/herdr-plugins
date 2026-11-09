import { messagesFor, type Messages } from '#src/i18n/index.ts';
import type { TabRecap } from '#src/ports/recap-records.ts';
import type { TabView } from '#src/ports/tab-views.ts';
import { must } from '#src/protocol/result.ts';
import { renderRecap } from '#src/recap/application/recap-shape.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import { GUI_TAB_VERSION, UNKNOWN, orElse, worstStatus, type GuiLane, type GuiSections, type GuiTab, type GuiTask } from '#src/recap/domain/gui-tab.ts';
import { NO, YES, type GuiBreak, type GuiFact, type GuiGroup, type GuiVersions } from '#src/recap/domain/gui-tab-parts.ts';
import { parsePaneId, parseTabId } from '#src/recap/domain/ids.ts';
import { NO_SECTIONS, type RecapSections } from '#src/recap/domain/shape.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import { parseNonEmptyText, parseText, type NonEmptyText, type Text } from '#src/recap/domain/text.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { groupsOf } from '#src/recap/render/groups.ts';
import type { ExpandedTask } from '#src/recap/render/expanded.ts';
import { guiLaneOf, type LaneDraw } from './gui-tab-lanes.ts';
import { BLANK_READS, type GuiReads } from './gui-tab-reads.ts';
import { breakOf, factOf, regionsOf, storyOf, timelineRowsOf } from './gui-tab-regions.ts';
import { guiSessionOf } from './gui-tab-session.ts';

export type { GuiReads } from './gui-tab-reads.ts';

const ZERO: Count = must(parseCount(0));

function guiSections(sections: RecapSections | null): GuiSections {
    const given = sections ?? NO_SECTIONS;
    return {
        goal: must(parseText(given.goal)), now: given.now.map(parseText).map(must), needs: given.needs.map(parseText).map(must), done: given.done.map(parseText).map(must),
        decisions: given.decisions.map(parseText).map(must), next: given.next.map(parseText).map(must), links: given.links.map(parseText).map(must),
        rules: given.rules.map(parseText).map(must),
    };
}

const markdownOf = (task: RecapTask, messages: Messages): Text => must(parseText(task.sections === null ? task.markdown : renderRecap(task.sections, messages.locale)));

interface TaskDraw {
    readonly now: Instant;
    readonly messages: Messages;
    readonly reads: GuiReads;
    readonly webs: Parameters<typeof factOf>[1];
}

const BLANK_EXPANDED: ExpandedTask = { name: '', facts: [], story: null, curating: false };

function guiTask(task: RecapTask, found: ExpandedTask | undefined, draw: TaskDraw): GuiTask {
    const expanded = found ?? BLANK_EXPANDED;
    const facts: readonly Fact[] = expanded.facts;
    const regions = regionsOf(facts);
    const breaks = breaksOf(draw.reads, draw.messages);
    const guiFacts: readonly GuiFact[] = facts.map((fact) => factOf(fact, draw.webs));
    const waited = (id: NonEmptyText): Count => orElse(parseCount(Math.max(0, draw.now - (guiFacts.find((fact) => fact.id === id)?.firstAt ?? draw.now))), ZERO);
    return {
        id: orElse(parseNonEmptyText(task.id), UNKNOWN), name: must(parseText(task.name)), sections: guiSections(task.sections), markdown: markdownOf(task, draw.messages),
        facts: guiFacts, regions, timeline: timelineRowsOf(facts, breaks, { now: draw.now, zone: draw.reads.zone }), story: storyOf(expanded.story, draw.webs),
        curating: expanded.curating ? YES : NO, needsWaitedMs: regions.needs.map(waited),
    };
}

function versionsOf(view: TabView | null, reads: GuiReads): GuiVersions {
    const daemon = orElse(parseText(view?.daemonVersion), null);
    return { plugin: reads.plugin, daemon, stale: reads.plugin !== null && daemon !== reads.plugin ? YES : NO };
}

function groupsFor(view: TabView | null, recap: TabRecap): readonly GuiGroup[] {
    return groupsOf(view?.lanes ?? [], recap.tasks).map((group): GuiGroup => ({
        task: group.task === null ? null : orElse(parseNonEmptyText(group.task.id), null),
        lanes: group.lanes.map((lane) => parsePaneId(lane.pane)).flatMap((pane) => (pane.kind === 'ok' ? [pane.value] : [])),
    }));
}

const nameOf = (recap: TabRecap): NonEmptyText => orElse(parseNonEmptyText(recap.tasks[0]?.name), orElse(parseNonEmptyText(recap.tab), UNKNOWN));

const lanesOf = (view: TabView | null, draw: LaneDraw): readonly GuiLane[] => (view?.lanes ?? []).map((lane) => guiLaneOf(lane, draw)).filter((lane): lane is GuiLane => lane !== null);

const breaksOf = (reads: GuiReads, messages: Messages): readonly GuiBreak[] => (reads.expanded?.breaks ?? []).map((each) => breakOf(each, messages));

const claudeRecapsOf = (recap: TabRecap): readonly Text[] => recap.lanes.flatMap((lane) => orElse(parseText(lane.claudeRecap), null) ?? []);

const expandedOf = (reads: GuiReads, task: RecapTask): ExpandedTask | undefined => reads.expanded?.tasks.find((each) => each.name === task.name);

const websOf = (view: TabView | null, reads: GuiReads): TaskDraw['webs'] => reads.expanded?.webs ?? (view?.lanes ?? []).map((lane) => lane.web);

const sessionOf = (reads: GuiReads): GuiTab['session'] => (reads.expanded === null ? null : guiSessionOf(reads.expanded.session));

export function guiTabOf(recap: TabRecap, view: TabView | null, now: Instant, reads: GuiReads = BLANK_READS): GuiTab {
    const messages = messagesFor(reads.locale);
    const lanes = lanesOf(view, { reads, messages, now, recap });
    const taskDraw: TaskDraw = { now, messages, reads, webs: websOf(view, reads) };
    return {
        version: GUI_TAB_VERSION, tab: must(parseTabId(recap.tab)), name: nameOf(recap), status: worstStatus(lanes), at: now,
        recapAt: recap.at === null ? null : instant(recap.at), writing: recap.running ? 'writing' : 'resting', error: orElse(parseText(recap.error), null),
        lanes, tasks: recap.tasks.map((task) => guiTask(task, expandedOf(reads, task), taskDraw)),
        locale: reads.locale, zone: reads.zone, compactHint: reads.compactHint, backend: orElse(parseText(recap.backend), null), versions: versionsOf(view, reads), warnings: reads.warnings,
        claudeRecaps: claudeRecapsOf(recap), groups: groupsFor(view, recap), breaks: breaksOf(reads, messages), session: sessionOf(reads), cuts: [],
    };
}
