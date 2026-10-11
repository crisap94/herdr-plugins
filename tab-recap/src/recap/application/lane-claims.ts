import type { CompactRequest } from '#src/ports/requests.ts';
import type { ClaimKind } from '#src/recap/domain/lane-claim.ts';

type Held = { readonly kind: 'compaction'; readonly joined: CompactRequest[] } | { readonly kind: 'handoff' };

export interface PaneClaim {
    readonly pane: string;
    readonly kind: ClaimKind;
}

export class LaneClaims {
    private readonly held = new Map<string, Held>();

    claim(pane: string, kind: ClaimKind): boolean {
        if (this.held.has(pane)) {
            return false;
        }
        this.put(pane, kind);
        return true;
    }

    claimAll(claims: readonly PaneClaim[]): boolean {
        const panes = new Set(claims.map((claim) => claim.pane));
        if (panes.size !== claims.length || claims.some((claim) => this.held.has(claim.pane))) {
            return false;
        }
        for (const claim of claims) {
            this.put(claim.pane, claim.kind);
        }
        return true;
    }

    has(pane: string): boolean {
        return this.held.has(pane);
    }

    kindOf(pane: string): ClaimKind | null {
        return this.held.get(pane)?.kind ?? null;
    }

    join(pane: string, request: CompactRequest): void {
        const claim = this.held.get(pane);
        if (claim?.kind === 'compaction') {
            claim.joined.push(request);
        }
    }

    joinedOf(pane: string): readonly CompactRequest[] {
        const claim = this.held.get(pane);
        return claim?.kind === 'compaction' ? claim.joined : [];
    }

    release(pane: string): void {
        this.held.delete(pane);
    }

    private put(pane: string, kind: ClaimKind): void {
        this.held.set(pane, kind === 'compaction' ? { kind, joined: [] } : { kind });
    }
}
