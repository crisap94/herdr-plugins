import { HerdrFleet } from '#src/adapters/herdr-fleet.ts';
import { loadConfig, stateDir } from '#src/daemon/config.ts';
import { startCompact } from '#src/recap/application/compact-start.ts';
import type { Requests } from '#src/ports/requests.ts';
import { unknown } from '#src/ports/unknowable.ts';

export function compactFromColumn(store: { readonly requests: Requests } | null, tab: string): void {
    void startCompact(tab, null, undefined, loadConfig().compactNote, {
        askNote: (asked, pane) => new HerdrFleet(stateDir()).agents().askNote(asked, pane),
        queue: (request) => {
            if (store === null) {
                return unknown({ why: 'unreadable', detail: 'the state store is not ready' });
            }
            store.requests.requestCompact(request);
            return { kind: 'done' };
        },
    });
}
