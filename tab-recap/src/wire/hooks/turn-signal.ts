export type TurnSignal =
    | { readonly kind: 'as-status' }
    | { readonly kind: 'direct' }
    | { readonly kind: 'none' };
export const STATUS_COVERS_MS = 30_000;
export function turnSignalOf(lane: { readonly status: 'working' | 'blocked' | 'idle' | 'done' | 'unknown' }, statusEndedAt: number | null, now: number): TurnSignal {
    if (lane.status === 'working') return { kind: 'as-status' };
    if (statusEndedAt !== null && now - statusEndedAt <= STATUS_COVERS_MS) return { kind: 'none' };
    return { kind: 'direct' };
}
