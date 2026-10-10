import type { CompactRequest } from '#src/ports/requests.ts';

export class CompactionClaims {
    private readonly joined = new Map<string, CompactRequest[]>();

    claim(pane: string): boolean {
        if (this.joined.has(pane)) {
            return false;
        }
        this.joined.set(pane, []);
        return true;
    }

    has(pane: string): boolean {
        return this.joined.has(pane);
    }

    join(pane: string, request: CompactRequest): void {
        this.joined.get(pane)?.push(request);
    }

    joinedOf(pane: string): readonly CompactRequest[] {
        return this.joined.get(pane) ?? [];
    }

    release(pane: string): void {
        this.joined.delete(pane);
    }
}
