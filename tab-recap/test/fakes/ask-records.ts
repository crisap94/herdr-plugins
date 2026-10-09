// The compaction requests from other tools, in memory: the same contract as the store's, for tests that restart a handler over one set of asks.
import type { AskRecords } from '#src/ports/ask-records.ts';

export class MemoryAsks implements AskRecords {
    readonly rows = new Map<string, string>();

    seen(tool: string, id: string): boolean {
        return this.rows.has(`${tool}\u0000${id}`);
    }

    remember(tool: string, id: string, pane: string): void {
        this.rows.set(`${tool}\u0000${id}`, pane);
    }
}
