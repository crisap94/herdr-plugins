import type { AskRecords } from '#src/ports/ask-records.ts';

export class MemoryAsks implements AskRecords {
    readonly rows = new Map<string, string>();

    seen(tool: string, id: string): boolean {
        return this.rows.has(`${tool}\u0000${id}`);
    }

    remember(tool: string, id: string, pane: string): void {
        this.rows.set(`${tool}\u0000${id}`, pane);
    }

    prune(): void {
        this.rows.clear();
    }
}
