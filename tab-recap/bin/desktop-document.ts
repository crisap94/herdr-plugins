import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DesktopReads } from '#src/adapters/desktop-expanded.ts';
import { GuiPublisher } from '#src/adapters/gui-publisher.ts';
import { openCliStore } from '#src/daemon/cli-store.ts';
import { messagesOf, stateDir } from '#src/daemon/config.ts';
import { must } from '#src/protocol/result.ts';
import type { GuiReads } from '#src/recap/application/gui-tab-reads.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import { GUI_TAB_VERSION, encodeGuiTab, guiFileName } from '#src/recap/domain/gui-tab.ts';
import { parseGuiVersion } from '#src/recap/domain/gui-tab-types.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import type { NonEmptyText } from '#src/recap/domain/text.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';

function publishedBy(daemon: string, tab: TabId): string | null {
    try {
        const text = readFileSync(join(daemon, guiFileName(tab)), 'utf8');
        const version = parseGuiVersion(JSON.parse(text));
        return version.kind === 'ok' && version.value === GUI_TAB_VERSION ? text : null;
    } catch {
        return null;
    }
}

const now = (): Instant => instant(Date.now());

export function desktopDocumentCommand(tab: TabId): number {
    const dir = must(parseDirectory(join(stateDir(), 'gui')));
    const published = publishedBy(dir, tab);
    if (published !== null) {
        console.log(published);
        return 0;
    }
    const store = openCliStore();
    if (store.kind !== 'ready') {
        console.error(`tab-recap: 1 — ${messagesOf().database.newer(store.backup)}`);
        return 1;
    }
    const reads = new DesktopReads({ store, dir, now, republish: (): void => undefined, mode: 'read-only' });
    const publisher = new GuiPublisher({ dir, records: store.records, views: store.views, now, log: (line: NonEmptyText): void => { console.error(line); }, reads: (found, view): GuiReads => reads.read(found, view) });
    const document = publisher.document(tab);
    if (document === null) {
        console.error(`tab-recap: 1 — no recap for ${tab}`);
        return 1;
    }
    const encoded = encodeGuiTab(document);
    if (encoded.kind === 'err') {
        console.error(`tab-recap: 1 — the document is ${encoded.error.bytes} bytes, over the limit`);
        return 1;
    }
    console.log(encoded.value);
    return 0;
}
