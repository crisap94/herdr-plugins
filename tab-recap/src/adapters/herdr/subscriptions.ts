import type { EventSubscription, Subscription } from '@stateforge-labs/herdr-sdk';
import { subscribeOnOwnClient } from './client.ts';
import type { Topic } from '#src/ports/fleet-source.ts';

const GLOBAL_SPECS = new Map<string, Subscription>([
    ['pane.created', { type: 'pane.created' }],
    ['pane.updated', { type: 'pane.updated' }],
    ['pane.closed', { type: 'pane.closed' }],
    ['pane.moved', { type: 'pane.moved' }],
    ['pane.agent_detected', { type: 'pane.agent_detected' }],
    ['tab.focused', { type: 'tab.focused' }],
    ['tab.closed', { type: 'tab.closed' }],
    ['layout.updated', { type: 'layout.updated' }],
]);

export function subscribeTopics(topics: readonly Topic[]): Promise<EventSubscription> {
    const specs: Subscription[] = [];
    for (const topic of topics) {
        if (topic.pane_id !== undefined) {
            if (topic.type === 'pane.agent_status_changed') {
                specs.push({ type: 'pane.agent_status_changed', pane_id: topic.pane_id });
            }
            continue;
        }
        const spec = GLOBAL_SPECS.get(topic.type);
        if (spec !== undefined) {
            specs.push(spec);
        }
    }
    return subscribeOnOwnClient(specs);
}
