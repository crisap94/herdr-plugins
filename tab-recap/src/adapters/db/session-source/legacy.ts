import type { Database } from 'bun:sqlite';
import type { CompactionTokens, SessionSource } from '#src/ports/session-source.ts';
import { parseTabId } from '#src/recap/domain/ids.ts';
import { SessionSourceStore } from '../session-source.ts';

export class SessionSourceRepository implements SessionSource {
    private readonly store: SessionSourceStore;

    constructor(db: Database) {
        this.store = new SessionSourceStore(db);
    }

    firstSeen(tab: string): number | null {
        const id = parseTabId(tab);
        return id.kind === 'ok' ? this.store.firstSeen(id.value) : null;
    }

    runsByCause(tab: string): Readonly<Record<string, number>> {
        const id = parseTabId(tab);
        return id.kind === 'ok' ? this.store.runsByCause(id.value) : {};
    }

    compactions(tab: string): readonly CompactionTokens[] {
        const id = parseTabId(tab);
        return id.kind === 'ok' ? this.store.compactions(id.value) : [];
    }
}
