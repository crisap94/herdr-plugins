export type LaneStatus = 'working' | 'blocked' | 'idle' | 'done' | 'unknown';

const KNOWN: readonly LaneStatus[] = ['working', 'blocked', 'idle', 'done', 'unknown'];

export function laneStatus(raw: string | null | undefined): LaneStatus {
    return KNOWN.find((candidate) => candidate === raw) ?? 'unknown';
}

export function endsTurn(from: LaneStatus, to: LaneStatus): boolean {
    return from === 'working' && (to === 'idle' || to === 'done' || to === 'blocked');
}
