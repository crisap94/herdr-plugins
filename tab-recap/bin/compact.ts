import { stateStore } from '#src/adapters/db/database.ts';
import { HerdrFleet } from '#src/adapters/herdr-fleet.ts';
import { loadConfig, messagesOf, stateDir } from '#src/daemon/config.ts';
import { opensPopup, requestNoteOf, startCompact } from '#src/recap/application/compact-start.ts';
import type { Done } from '#src/ports/columns.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import { isUnknown, saying, unknown } from '#src/ports/unknowable.ts';

const OK = 0;
const FAILED = 1;

function queueCompaction(request: CompactRequest): Done {
    const store = stateStore(stateDir());
    if (store.kind !== 'ready') {
        console.error(`tab-recap: 1 — ${messagesOf().database.newer(store.backup)}`);
        return unknown({ why: 'unreadable', detail: 'the state store is not ready' });
    }
    store.requests.requestCompact(request);
    store.close();
    return { kind: 'done' };
}

export async function compactCommand(tab: string, pane: string | null, note: string | undefined): Promise<number> {
    const setting = loadConfig().compactNote;
    const text = note === undefined ? undefined : requestNoteOf(note);
    const m = messagesOf();
    const started = await startCompact(tab, pane, text, setting, {
        askNote: async (asked, shown) => {
            await new Promise((resolve) => { setTimeout(resolve, Number(process.env['TAB_RECAP_COMPACT_DELAY_MS'] ?? 0) || 0); });
            return new HerdrFleet(stateDir()).agents().askNote(asked, shown);
        },
        queue: queueCompaction,
    });
    if (isUnknown(started)) {
        console.error(`tab-recap: 1 — ${(opensPopup(text, setting) ? m.cli.modalFailed : m.cli.compactNotQueued)(saying(started.why))}`);
        return FAILED;
    }
    console.log(`tab-recap: ${m.cli.compactAsked}`);
    return OK;
}
