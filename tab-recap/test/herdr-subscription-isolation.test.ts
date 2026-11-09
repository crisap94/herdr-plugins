import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HerdrTransportError, Method } from '@stateforge-labs/herdr-sdk';
import { createFakeHerdr } from '@stateforge-labs/herdr-sdk/test-kit';
import { usePlugin, resetHerdrClients } from '#src/adapters/herdr/client.ts';
import { subscribeTopics } from '#src/adapters/herdr/subscriptions.ts';

test('a transport failure on a shared call leaves a live event subscription open', async () => {
    const herdr = await createFakeHerdr();
    const before = process.env['HERDR_SOCKET_PATH'];
    process.env['HERDR_SOCKET_PATH'] = herdr.path;
    resetHerdrClients();
    try {
        const subscription = await subscribeTopics([{ type: 'tab.focused' }]);
        const frames = subscription[Symbol.asyncIterator]();
        herdr.rawReply(Method.PaneRead, 'not a json line');
        await assert.rejects(usePlugin((client) => client.call('pane.read', { pane_id: 'w1:p1', source: 'recent_unwrapped', lines: 10, format: 'text' })), HerdrTransportError);
        const next = frames.next();
        herdr.push({ event: 'unknown.probe', data: {} });
        const frame = await next;
        assert.equal(frame.done, false, 'the subscription must still deliver frames after the failed call');
        subscription.close();
    } finally {
        if (before === undefined) { delete process.env['HERDR_SOCKET_PATH']; } else { process.env['HERDR_SOCKET_PATH'] = before; }
        resetHerdrClients();
        await herdr.stop();
    }
});
