export interface Row {
    readonly fields: Record<string, unknown>;
}

export function take(row: Row): void {
    void row;
}
