import { join } from 'node:path';
import type { ScopeId } from '#src/recap/domain/ids.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { must } from '#src/protocol/result.ts';
import { stateDirectory } from '#src/daemon/config.ts';
import type { CurrentSession } from '#src/recap/application/lane-recent.ts';
import type { NonEmptyText } from '#src/recap/domain/text.ts';
import type { Store } from '../db/database.ts';
import type { Frontend, FlushTab } from '#src/ports/frontend.ts';
import { AllHidden } from './all-hidden.ts';
import { DesktopReads } from './expanded.ts';
import type { GuiReads } from '#src/recap/application/gui-tab-reads.ts';
import { GuiPublisher, type GuiPublisherDeps } from './publisher.ts';
import { DesktopBus } from './bus.ts';
import { DesktopEngine } from './engine.ts';
import { desktopPrinter } from './handoff.ts';
import { OpenLeases } from './lease.ts';
import { startDesktopApi } from './api/start.ts';
import { HcCoreFleet } from '../herdr-core/fleet.ts';
import type { SocketPath } from '../herdr-core/sdk-core.ts';
import { claudeSessions, defaultClaudeHome } from '../herdr-core/sessions.ts';
import { AUTO_PATH_KINDS, PathHarnessDirectory } from '../harness/on-path.ts';
import { PublishingRecords } from './publishing-records.ts';
import { PublishingViews } from './publishing-views.ts';

function fleetFor(path?: SocketPath): HcCoreFleet {
    const parts = { harnesses: new PathHarnessDirectory(AUTO_PATH_KINDS), sessions: claudeSessions(defaultClaudeHome()), ...(path === undefined ? {} : { path }) };
    return new HcCoreFleet(parts);
}

function sessionThrough(fleet: HcCoreFleet): CurrentSession {
    return (pane) => fleet.sessionOf(pane);
}

const now = (): Instant => instant(Date.now());

interface Shared {
    readonly bus: DesktopBus;
    readonly leases: OpenLeases;
}

interface Publishing {
    readonly publisher: GuiPublisher;
    readonly forget: (tab: ScopeId) => void;
}

function publisherFor(store: Store, log: (line: NonEmptyText) => void, shared: Shared): Publishing {
    const dir = must(parseDirectory(join(stateDirectory(), 'gui')));
    const later: { publisher: GuiPublisher | null } = { publisher: null };
    const reads = new DesktopReads({ store, dir, now, republish: (tab): void => { later.publisher?.publish(tab); }, mode: 'daemon', leases: shared.leases });
    const deps: GuiPublisherDeps = { dir, records: store.records, views: store.views, now, log, bus: shared.bus, reads: (tab, view): GuiReads => reads.read(tab, view) };
    later.publisher = new GuiPublisher(deps);
    return { publisher: later.publisher, forget: (tab): void => { reads.forget(tab); } };
}

function engineFor(store: Store, fleet: HcCoreFleet, publishing: Publishing, flush: FlushTab): DesktopEngine {
    const republish = (tab: ScopeId): void => {
        publishing.forget(tab);
        publishing.publisher.publish(tab);
    };
    return new DesktopEngine({ ledger: store.ledger, stories: store.stories, records: store.records, views: store.views, printer: desktopPrinter(fleet, flush), now, republish });
}

export function desktopFrontend(path?: SocketPath): Frontend {
    const fleet = fleetFor(path);
    return {
        fleet,
        session: sessionThrough(fleet),
        wrap: (store, log, flush): Store => {
            const shared: Shared = { bus: new DesktopBus(now), leases: new OpenLeases(now) };
            const publishing = publisherFor(store, log, shared);
            const { publisher } = publishing;
            const api = startDesktopApi({ dir: must(parseDirectory(join(stateDirectory(), 'gui'))), ...shared, requests: store.requests, now, engine: engineFor(store, fleet, publishing, flush) }, log);
            const publish = (tab: Parameters<GuiPublisher['publish']>[0]): void => { publisher.publish(tab); };
            return { ...store, records: new PublishingRecords(store.records, publish), views: new PublishingViews(store.views, publish), visibility: new AllHidden(), close: (): void => { api?.close(); store.close(); } };
        },
    };
}
