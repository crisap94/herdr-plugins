// `tab-recap compact [--note <text>]`: the note popup when the setting says `ask` and no note is given, otherwise the request queued at once.
// Exit: 0 requested · 1 not requested (the popup did not open, or the state store is not ready).
import { stateStore } from '#src/adapters/db/database.ts';
import { HerdrFleet } from '#src/adapters/herdr-fleet.ts';
import { loadConfig, messagesOf, stateDir } from '#src/daemon/config.ts';
import { opensPopup, requestNoteOf, startCompact } from '#src/recap/application/compact-start.ts';
import type { Done } from '#src/ports/columns.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import { isUnknown, saying, unknown } from '#src/ports/unknowable.ts';

const OK = 0;
const FAILED = 1;

/** The request the popup sends, queued at once in the state store (the daemon takes it from there). */
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

/** `note` is the `--note` text, undefined when none was given: then the setting decides. */
export async function compactCommand(tab: string, pane: string | null, note: string | undefined): Promise<number> {
    const setting = loadConfig().compactNote;
    const text = note === undefined ? undefined : requestNoteOf(note);
    const m = messagesOf();
    const started = await startCompact(tab, pane, text, setting, {
        askNote: async (asked, shown) => {
            // a modal that asked for this is closing: herdr shows one popup at a time
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
