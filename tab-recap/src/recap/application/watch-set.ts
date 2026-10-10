import type { PaneId } from '#src/recap/domain/ids.ts';
import type { Topic } from '#src/ports/fleet-source.ts';

/**
 * The watched-set policy, in exactly one file. Only 3 of herdr's 27 subscribable types
 * are per-pane; `pane.agent_status_changed` is the one that ends a turn, so every lane
 * gets its own. The globals tell us when the set itself has to change.
 */
export const GLOBAL_TOPICS = [
    'pane.created',
    'pane.updated',
    'pane.closed',
    'pane.moved',
    'pane.agent_detected',
    'tab.focused',
    'tab.closed',
    'layout.updated',
] as const;

export const PER_PANE_TOPIC = 'pane.agent_status_changed';

export function specsFor(lanes: readonly PaneId[]): readonly Topic[] {
    const globals: Topic[] = GLOBAL_TOPICS.map((type) => ({ type }));
    const perLane: Topic[] = lanes.map((pane) => ({ type: PER_PANE_TOPIC, pane_id: String(pane) }));
    return [...globals, ...perLane];
}
