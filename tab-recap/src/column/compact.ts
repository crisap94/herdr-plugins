// `c` in a column: the compact setting decides, with no popup for `skip` (queued through the column's own store) and the note popup for `ask`.
import { HerdrFleet } from '#src/adapters/herdr-fleet.ts';
import { loadConfig, stateDir } from '#src/daemon/config.ts';
import { startCompact } from '#src/recap/application/compact-start.ts';
import type { Requests } from '#src/ports/requests.ts';
import { unknown } from '#src/ports/unknowable.ts';

/** `store` is the column's state store, null when it is not ready: a request then cannot be queued and nothing shows. */
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
