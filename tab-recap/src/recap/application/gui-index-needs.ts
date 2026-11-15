import type { GuiFact } from '#src/recap/domain/gui-tab-parts.ts';
import type { GuiLane, GuiTab, GuiTask } from '#src/recap/domain/gui-tab.ts';
import type { NonEmptyText, Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';

const BLOCKED = 'blocked';
const OPEN = 'open';

export interface OpenNeed {
    readonly text: Text;
    readonly firstAt: Instant | null;
}

const factsOf = (task: GuiTask, ids: readonly NonEmptyText[]): readonly GuiFact[] => ids.flatMap((id) => task.facts.filter((fact) => fact.id === id && fact.state === OPEN));

function needsOfTask(task: GuiTask): readonly OpenNeed[] {
    if (task.facts.length === 0) { return task.sections.needs.map((text): OpenNeed => ({ text, firstAt: null })); }
    return factsOf(task, task.regions.needs).map((fact): OpenNeed => ({ text: fact.text, firstAt: fact.firstAt }));
}

export const openNeedsOf = (tab: GuiTab): readonly OpenNeed[] => tab.tasks.flatMap(needsOfTask);

export const earliest = (times: readonly Instant[]): Instant | null => times.reduce<Instant | null>((best, time) => (best === null || time < best ? time : best), null);

export function oldestNeedOf(needs: readonly OpenNeed[]): OpenNeed | null {
    const oldest = earliest(needs.flatMap((need) => need.firstAt ?? []));
    return needs.find((need) => oldest !== null && need.firstAt === oldest) ?? needs[0] ?? null;
}

const blockedSince = (lanes: readonly GuiLane[]): Instant | null => earliest(lanes.filter((lane) => lane.status === BLOCKED).flatMap((lane) => lane.since ?? []));

export const waitingSinceOf = (tab: GuiTab, needs: readonly OpenNeed[]): Instant | null => earliest(needs.flatMap((need) => need.firstAt ?? [])) ?? blockedSince(tab.lanes);
