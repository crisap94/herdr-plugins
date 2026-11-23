import { setTimeout as sleep } from 'node:timers/promises';
import { notReadyLine, openCliStore } from '#src/daemon/cli-store.ts';
import { HerdrFleet } from '#src/adapters/herdr/fleet.ts';
import { loadSettings, messagesOf, stateDirectory } from '#src/daemon/config.ts';
import { beginCompact, noteFromRequest, opensAskPopup } from '#src/recap/application/compact-start.ts';
import type { Done } from '#src/ports/columns.ts';
import type { CompactAsk } from '#src/ports/requests.ts';
import { isUnknown, saying, unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';

const OK = 0;
const FAILED = 1;

function queueCompaction(request: CompactAsk): Done {
    const store = openCliStore();
    if (store.kind !== 'ready') {
        console.error(`tab-recap: 1 — ${notReadyLine(store, messagesOf())}`);
        return unknown({ why: 'unreadable', detail: causeOf(must(parseText('the state store is not ready'))) });
    }
    store.requests.requestCompact(request);
    store.close();
    return { kind: 'done' };
}

export async function compactCommand(tab: string, pane: string | null, note: string | undefined): Promise<number> {
    const setting = loadSettings().compactNote;
    const text = note === undefined ? undefined : noteFromRequest(textOf(note));
    const m = messagesOf();
    const started = await beginCompact(tabId(textOf(tab)), pane === null ? null : paneId(textOf(pane)), text, setting, {
        askNote: async (asked, shown) => {
            await sleep(Number(process.env['TAB_RECAP_COMPACT_DELAY_MS'] ?? 0) || 0);
            return new HerdrFleet(textOf(stateDirectory())).agents().askNote(asked, shown);
        },
        queue: queueCompaction,
    });
    if (isUnknown(started)) {
        console.error(`tab-recap: 1 — ${(opensAskPopup(text, setting) === 'present' ? m.cli.modalFailed : m.cli.compactNotQueued)(saying(started.why))}`);
        return FAILED;
    }
    console.log(`tab-recap: ${m.cli.compactAsked}`);
    return OK;
}
