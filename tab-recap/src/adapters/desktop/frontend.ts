import { join } from 'node:path';
import { AUTO_ORDER } from '#src/recap/domain/backend.ts';
import { parsePaneId, type SessionId, type TabId } from '#src/recap/domain/ids.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { must } from '#src/protocol/result.ts';
import { stateDir } from '#src/daemon/config.ts';
import type { CurrentSession } from '#src/recap/application/lane-recent.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import type { NonEmptyText } from '#src/recap/domain/text.ts';
import type { Store } from '../db/database.ts';
import type { Frontend } from '#src/ports/frontend.ts';
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
import { PathHarnesses } from '../harness/on-path.ts';
import { PublishingRecords } from './publishing-records.ts';
import { PublishingViews } from './publishing-views.ts';

function fleetFor(path?: SocketPath): HcCoreFleet {
    const parts = { harnesses: new PathHarnesses(AUTO_ORDER), sessions: claudeSessions(defaultClaudeHome()), ...(path === undefined ? {} : { path }) };
    return new HcCoreFleet(parts);
}

interface PaneInput {}

function sessionThrough(fleet: HcCoreFleet): CurrentSession {
    return async (pane: PaneInput): Promise<SessionId | null | Unknown> => {
        const parsed = parsePaneId(pane);
        return parsed.kind === 'ok' ? fleet.sessionOf(parsed.value) : null;
    };
}

const now = (): Instant => instant(Date.now());

interface Shared {
    readonly bus: DesktopBus;
    readonly leases: OpenLeases;
}

interface Publishing {
    readonly publisher: GuiPublisher;
    readonly forget: (tab: TabId) => void;
}

function publisherFor(store: Store, log: (line: NonEmptyText) => void, shared: Shared): Publishing {
    const dir = must(parseDirectory(join(stateDir(), 'gui')));
    const later: { publisher: GuiPublisher | null } = { publisher: null };
    const reads = new DesktopReads({ store, dir, now, republish: (tab): void => { later.publisher?.publish(tab); }, mode: 'daemon', leases: shared.leases });
    const deps: GuiPublisherDeps = { dir, records: store.records, views: store.views, now, log, bus: shared.bus, reads: (tab, view): GuiReads => reads.read(tab, view) };
    later.publisher = new GuiPublisher(deps);
    return { publisher: later.publisher, forget: (tab): void => { reads.forget(tab); } };
}

function engineFor(store: Store, fleet: HcCoreFleet, publishing: Publishing): DesktopEngine {
    const republish = (tab: TabId): void => {
        publishing.forget(tab);
        publishing.publisher.publish(tab);
    };
    return new DesktopEngine({ ledger: store.ledger, stories: store.stories, records: store.records, views: store.views, printer: desktopPrinter(fleet), now, republish });
}

export function desktopFrontend(path?: SocketPath): Frontend {
    const fleet = fleetFor(path);
    return {
        fleet,
        session: sessionThrough(fleet),
        wrap: (store, log): Store => {
            const shared: Shared = { bus: new DesktopBus(now), leases: new OpenLeases(now) };
            const publishing = publisherFor(store, log, shared);
            const { publisher } = publishing;
            const api = startDesktopApi({ dir: must(parseDirectory(join(stateDir(), 'gui'))), ...shared, requests: store.requests, now, engine: engineFor(store, fleet, publishing) }, log);
            const publish = (tab: Parameters<GuiPublisher['publish']>[0]): void => { publisher.publish(tab); };
            return { ...store, records: new PublishingRecords(store.records, publish), views: new PublishingViews(store.views, publish), visibility: new AllHidden(), close: (): void => { api?.close(); store.close(); } };
        },
    };
}
