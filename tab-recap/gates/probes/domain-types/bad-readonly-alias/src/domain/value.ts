export type Row = Readonly<{ id: string; count: number }>;

export function take(row: Row): void {
    void row;
}
