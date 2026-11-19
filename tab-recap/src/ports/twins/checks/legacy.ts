export interface CheckAnchor {
    readonly item: string;
    readonly pass: boolean;
    readonly reason: string;
}

export type CheckAnchors = ReadonlyMap<string, readonly CheckAnchor[]>;
