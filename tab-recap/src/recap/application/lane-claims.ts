import type { CompactAsk } from '#src/ports/requests.ts';
import type { ClaimKind } from '#src/recap/domain/lane-claim.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';

type Held = { readonly kind: 'compaction'; readonly joined: CompactAsk[] } | { readonly kind: 'handoff' };

export interface PaneClaim {
    readonly pane: PaneId;
    readonly kind: ClaimKind;
}

export type ClaimOutcome = 'claimed' | 'taken';
export type Holding = 'held' | 'free';

export class LaneClaims {
    private readonly held = new Map<PaneId, Held>();

    claim(pane: PaneId, kind: ClaimKind): ClaimOutcome {
        if (this.held.has(pane)) {
            return 'taken';
        }
        this.put(pane, kind);
        return 'claimed';
    }

    claimAll(claims: readonly PaneClaim[]): ClaimOutcome {
        const panes = new Set(claims.map((claim) => claim.pane));
        if (panes.size !== claims.length || claims.some((claim) => this.held.has(claim.pane))) {
            return 'taken';
        }
        for (const claim of claims) {
            this.put(claim.pane, claim.kind);
        }
        return 'claimed';
    }

    has(pane: PaneId): Holding {
        return this.held.has(pane) ? 'held' : 'free';
    }

    kindOf(pane: PaneId): ClaimKind | null {
        return this.held.get(pane)?.kind ?? null;
    }

    join(pane: PaneId, request: CompactAsk): void {
        const claim = this.held.get(pane);
        if (claim?.kind === 'compaction') {
            claim.joined.push(request);
        }
    }

    joinedOf(pane: PaneId): readonly CompactAsk[] {
        const claim = this.held.get(pane);
        return claim?.kind === 'compaction' ? claim.joined : [];
    }

    release(pane: PaneId): void {
        this.held.delete(pane);
    }

    private put(pane: PaneId, kind: ClaimKind): void {
        this.held.set(pane, kind === 'compaction' ? { kind, joined: [] } : { kind });
    }
}
