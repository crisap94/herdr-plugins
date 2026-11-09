import { HerdrTransportError, ProtocolPolicy, connectPlugin } from '@stateforge-labs/herdr-sdk';
import type { EventSubscription, Subscription } from '@stateforge-labs/herdr-sdk';
import { connectAdmin } from '@stateforge-labs/herdr-sdk/admin';
import type { PluginClient } from '@stateforge-labs/herdr-sdk';
import type { AdminClient } from '@stateforge-labs/herdr-sdk/admin';

const CALL_TIMEOUT_MS = 10_000;

interface Connection {
    close(): void;
}

interface Slot<C extends Connection> {
    current: Promise<C> | null;
}

const plugin: Slot<PluginClient> = { current: null };
const admin: Slot<AdminClient> = { current: null };

const openPlugin = (): Promise<PluginClient> => connectPlugin({ timeoutMs: CALL_TIMEOUT_MS, protocolPolicy: ProtocolPolicy.Minimum });
const openAdmin = (): Promise<AdminClient> => connectAdmin({ timeoutMs: CALL_TIMEOUT_MS, protocolPolicy: ProtocolPolicy.Minimum });

async function use<C extends Connection, T>(slot: Slot<C>, open: () => Promise<C>, run: (client: C) => Promise<T>): Promise<T> {
    const pending = slot.current ?? (slot.current = open());
    let client: C;
    try {
        client = await pending;
    } catch (error) {
        if (slot.current === pending) {
            slot.current = null;
        }
        throw error;
    }
    try {
        return await run(client);
    } catch (error) {
        if (error instanceof HerdrTransportError && slot.current === pending) {
            slot.current = null;
        }
        throw error;
    }
}

export function subscribeOnOwnClient(specs: readonly Subscription[]): Promise<EventSubscription> {
    return openPlugin().then((client) => client.events.subscribe(specs));
}

export function usePlugin<T>(run: (client: PluginClient) => Promise<T>): Promise<T> {
    return use(plugin, openPlugin, run);
}

export function useAdmin<T>(run: (client: AdminClient) => Promise<T>): Promise<T> {
    return use(admin, openAdmin, run);
}

function drop<C extends Connection>(slot: Slot<C>): void {
    const held = slot.current;
    slot.current = null;
    held?.then((client) => { client.close(); return null; }, () => null);
}

export function resetHerdrClients(): void {
    drop(plugin);
    drop(admin);
}
