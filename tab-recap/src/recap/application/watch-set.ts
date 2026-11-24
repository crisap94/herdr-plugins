import type { SessionKey } from '#src/recap/domain/ids.ts';
import type { FleetTopic } from '#src/ports/fleet-source.ts';
import { textOf } from '@stateforge-labs/session-ledger';

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

export function specsFor(lanes: readonly SessionKey[]): readonly FleetTopic[] {
    const globals: FleetTopic[] = GLOBAL_TOPICS.map((type) => ({ type: textOf(type) }));
    const perLane: FleetTopic[] = lanes.map((pane) => ({ type: textOf(PER_PANE_TOPIC), pane }));
    return [...globals, ...perLane];
}
