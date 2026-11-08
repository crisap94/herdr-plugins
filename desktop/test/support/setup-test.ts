import type { TestContext } from 'node:test';
import { duration } from '../../src/kernel/time.ts';
import { CoreEvents } from '../../src/hc-core/events.ts';
import type { CoreEventsTiming } from '../../src/hc-core/events.ts';
import { CoreLink } from '../../src/hc-core/link.ts';
import type { CoreLinkTiming } from '../../src/hc-core/link.ts';
import type { SocketPath } from '../../src/hc-core/wire.ts';
import { FakeHcCore } from '../fakes/hc-core.ts';

export const FAST_LINK: CoreLinkTiming = { helloTimeout: duration(300), backoffBase: duration(40), backoffCap: duration(160) };
export const FAST_EVENTS: CoreEventsTiming = { backoffBase: duration(30), backoffCap: duration(120), silence: duration(5000) };

export interface DesktopWorld {
    readonly core: FakeHcCore;
    readonly path: SocketPath;
    link(timing?: CoreLinkTiming): CoreLink;
    events(timing?: CoreEventsTiming): CoreEvents;
    close(): Promise<void>;
}

export async function openWorld(): Promise<DesktopWorld> {
    const core = await FakeHcCore.start();
    const links = new Set<CoreLink>();
    const streams = new Set<CoreEvents>();
    return {
        core,
        path: core.path,
        link: (timing = FAST_LINK): CoreLink => {
            const made = new CoreLink({ path: core.path, timing });
            links.add(made);
            return made;
        },
        events: (timing = FAST_EVENTS): CoreEvents => {
            const made = new CoreEvents({ path: core.path, timing });
            streams.add(made);
            return made;
        },
        close: async (): Promise<void> => {
            await Promise.all([...streams].map((made) => made.close()));
            await Promise.all([...links].map((made) => made.close()));
            await core.stop();
        },
    };
}

export async function setupTest(t: TestContext): Promise<DesktopWorld> {
    const world = await openWorld();
    t.after(() => world.close());
    return world;
}
