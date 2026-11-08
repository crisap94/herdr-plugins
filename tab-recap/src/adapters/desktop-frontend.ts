import { join } from 'node:path';
import { AUTO_ORDER } from '#src/recap/domain/backend.ts';
import { parsePaneId } from '#src/recap/domain/ids.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { must } from '#src/protocol/result.ts';
import { stateDir } from '#src/daemon/config.ts';
import type { CurrentSession } from '#src/recap/application/lane-recent.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import type { NonEmptyText } from '#src/recap/domain/text.ts';
import type { Store } from './db/database.ts';
import type { Frontend } from '#src/ports/frontend.ts';
import { AllHidden } from './all-hidden.ts';
import { DesktopReads } from './desktop-expanded.ts';
import type { GuiReads } from '#src/recap/application/gui-tab-reads.ts';
import { GuiPublisher, type GuiPublisherDeps } from './gui-publisher.ts';
import { HcFleet } from './hc-fleet.ts';
import { claudeSessions, defaultClaudeHome } from './hc-sessions.ts';
import { PathHarnesses } from './path-harnesses.ts';
import { PublishingRecords } from './publishing-records.ts';
import { PublishingViews } from './publishing-views.ts';

function sessionThrough(fleet: HcFleet): CurrentSession {
    return async (pane: string): Promise<string | null | Unknown> => {
        const parsed = parsePaneId(pane);
        return parsed.kind === 'ok' ? fleet.sessionOf(parsed.value) : null;
    };
}

const now = (): Instant => instant(Date.now());

function publisherFor(store: Store, log: (line: NonEmptyText) => void): GuiPublisher {
    const dir = must(parseDirectory(join(stateDir(), 'gui')));
    const later: { publisher: GuiPublisher | null } = { publisher: null };
    const reads = new DesktopReads({ store, dir, now, republish: (tab): void => { later.publisher?.publish(tab); }, mode: 'daemon' });
    const deps: GuiPublisherDeps = { dir, records: store.records, views: store.views, now, log, reads: (tab, view): GuiReads => reads.read(tab, view) };
    later.publisher = new GuiPublisher(deps);
    return later.publisher;
}

export function desktopFrontend(): Frontend {
    const fleet = new HcFleet({ harnesses: new PathHarnesses(AUTO_ORDER), sessions: claudeSessions(defaultClaudeHome()) });
    return {
        fleet,
        session: sessionThrough(fleet),
        wrap: (store, log): Store => {
            const publisher = publisherFor(store, log);
            const publish = (tab: Parameters<GuiPublisher['publish']>[0]): void => { publisher.publish(tab); };
            return { ...store, records: new PublishingRecords(store.records, publish), views: new PublishingViews(store.views, publish), visibility: new AllHidden() };
        },
    };
}
